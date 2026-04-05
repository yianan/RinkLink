import {
  AuthUIContext,
  DeleteAccountCard,
  PasskeysCard,
  ProvidersCard,
  TwoFactorCard,
  type AuthLocalization,
  type SettingsCardClassNames,
} from '@daveyplate/better-auth-ui';
import { Eye, EyeOff } from 'lucide-react';
import { useContext, useMemo, useState, type FormEvent } from 'react';

import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import SessionsCard from './SessionsCard';
import { cn } from '../../lib/cn';

type SecuritySettingsCardsProps = {
  className?: string;
  classNames?: {
    card?: SettingsCardClassNames;
    cards?: string;
  };
  localization?: Partial<AuthLocalization>;
};

type PasswordValidation = {
  minLength?: number;
  maxLength?: number;
  regex?: RegExp;
};

type PasswordErrors = {
  confirmPassword?: string;
  currentPassword?: string;
  newPassword?: string;
};

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function validatePassword(
  value: string,
  passwordValidation: PasswordValidation | undefined,
  localization: AuthLocalization,
  {
    requiredMessage,
  }: {
    requiredMessage: string;
  },
) {
  if (!value) return requiredMessage;
  if (passwordValidation?.minLength && value.length < passwordValidation.minLength) {
    return localization.PASSWORD_TOO_SHORT;
  }
  if (passwordValidation?.maxLength && value.length > passwordValidation.maxLength) {
    return localization.PASSWORD_TOO_LONG;
  }
  if (passwordValidation?.regex && !passwordValidation.regex.test(value)) {
    return localization.INVALID_PASSWORD;
  }
  return undefined;
}

function SettingsPasswordField({
  autoComplete,
  disabled,
  error,
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  autoComplete: string;
  disabled?: boolean;
  error?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="rinklink-settings-label">
        {label}
      </label>
      <div className="rinklink-settings-password-field">
        <Input
          id={id}
          autoComplete={autoComplete}
          className="rinklink-settings-input rinklink-settings-password-input"
          disabled={disabled}
          placeholder={placeholder}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="rinklink-settings-password-toggle"
          disabled={disabled}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span>{visible ? 'Hide' : 'Show'}</span>
        </button>
      </div>
      {error ? <div className="rinklink-settings-error px-3 py-2 text-sm">{error}</div> : null}
    </div>
  );
}

function ChangePasswordCard({
  accounts,
  accountsPending,
  classNames,
  localization,
  refetchAccounts,
}: {
  accounts: { providerId: string }[] | null | undefined;
  accountsPending: boolean;
  classNames?: SettingsCardClassNames;
  localization: AuthLocalization;
  refetchAccounts?: () => unknown;
}) {
  const {
    authClient,
    basePath,
    baseURL,
    credentials,
    hooks: { useSession },
    localization: contextLocalization,
    navigate,
    toast,
    viewPaths,
  } = useContext(AuthUIContext);

  const mergedLocalization = useMemo(
    () => ({ ...contextLocalization, ...localization }),
    [contextLocalization, localization],
  );

  const { data: sessionData } = useSession();
  const credentialsLinked = accounts?.some((account) => account.providerId === 'credential');
  const confirmPasswordEnabled = Boolean(credentials?.confirmPassword);
  const passwordValidation = credentials?.passwordValidation as PasswordValidation | undefined;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFieldError = (field: keyof PasswordErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSetPassword = async () => {
    const email = sessionData?.user.email?.trim();
    if (!email) {
      toast({
        variant: 'error',
        message: 'No active session email found for password setup.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${baseURL}${basePath}/${viewPaths.RESET_PASSWORD}`,
        fetchOptions: { throw: true },
      });
      toast({
        variant: 'success',
        message: mergedLocalization.FORGOT_PASSWORD_EMAIL,
      });
      navigate(`${basePath}/${viewPaths.SIGN_IN}${window.location.search}`);
    } catch (error) {
      toast({
        variant: 'error',
        message: extractErrorMessage(error, 'Unable to start password setup.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: PasswordErrors = {
      currentPassword: validatePassword(currentPassword, passwordValidation, mergedLocalization, {
        requiredMessage: 'Current password is required',
      }),
      newPassword: validatePassword(newPassword, passwordValidation, mergedLocalization, {
        requiredMessage: mergedLocalization.NEW_PASSWORD_REQUIRED,
      }),
      confirmPassword: confirmPasswordEnabled
        ? validatePassword(confirmPassword, passwordValidation, mergedLocalization, {
            requiredMessage: mergedLocalization.CONFIRM_PASSWORD_REQUIRED,
          })
        : undefined,
    };

    if (confirmPasswordEnabled && !nextErrors.confirmPassword && newPassword !== confirmPassword) {
      nextErrors.confirmPassword = mergedLocalization.PASSWORDS_DO_NOT_MATCH;
    }

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setIsSubmitting(true);
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
        fetchOptions: { throw: true },
      });
      toast({
        variant: 'success',
        message: mergedLocalization.CHANGE_PASSWORD_SUCCESS,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors({});
      refetchAccounts?.();
    } catch (error) {
      toast({
        variant: 'error',
        message: extractErrorMessage(error, 'Unable to change password.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const cardBaseClass = cn('rinklink-settings-card w-full text-start', classNames?.base);

  if (!credentialsLinked) {
    return (
      <Card className={cardBaseClass}>
        <div className={cn('rinklink-settings-header', classNames?.header)}>
          <h2 className={cn('rinklink-settings-title', classNames?.title)}>{mergedLocalization.SET_PASSWORD}</h2>
          <p className={cn('rinklink-settings-description', classNames?.description)}>{mergedLocalization.SET_PASSWORD_DESCRIPTION}</p>
        </div>
        <div className={cn('rinklink-settings-footer', classNames?.footer)}>
          <div />
          <Button
            type="button"
            size="sm"
            className={cn('rinklink-settings-button rinklink-settings-button-primary', classNames?.button, classNames?.primaryButton)}
            disabled={accountsPending || isSubmitting}
            onClick={handleSetPassword}
          >
            {mergedLocalization.SET_PASSWORD}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cardBaseClass}>
      <div className={cn('rinklink-settings-header', classNames?.header)}>
        <h2 className={cn('rinklink-settings-title', classNames?.title)}>{mergedLocalization.CHANGE_PASSWORD}</h2>
        <p className={cn('rinklink-settings-description', classNames?.description)}>{mergedLocalization.CHANGE_PASSWORD_DESCRIPTION}</p>
      </div>

      <form onSubmit={handleChangePassword}>
        <div className={cn('rinklink-settings-content', classNames?.content)}>
          <SettingsPasswordField
            id="settings-current-password"
            autoComplete="current-password"
            disabled={accountsPending || isSubmitting}
            error={errors.currentPassword}
            label={mergedLocalization.CURRENT_PASSWORD}
            placeholder={mergedLocalization.CURRENT_PASSWORD_PLACEHOLDER}
            value={currentPassword}
            onChange={(value) => {
              setCurrentPassword(value);
              clearFieldError('currentPassword');
            }}
          />
          <SettingsPasswordField
            id="settings-new-password"
            autoComplete="new-password"
            disabled={accountsPending || isSubmitting}
            error={errors.newPassword}
            label={mergedLocalization.NEW_PASSWORD}
            placeholder={mergedLocalization.NEW_PASSWORD_PLACEHOLDER}
            value={newPassword}
            onChange={(value) => {
              setNewPassword(value);
              clearFieldError('newPassword');
            }}
          />
          {confirmPasswordEnabled ? (
            <SettingsPasswordField
              id="settings-confirm-password"
              autoComplete="new-password"
              disabled={accountsPending || isSubmitting}
              error={errors.confirmPassword}
              label={mergedLocalization.CONFIRM_PASSWORD}
              placeholder={mergedLocalization.CONFIRM_PASSWORD_PLACEHOLDER}
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                clearFieldError('confirmPassword');
              }}
            />
          ) : null}
        </div>

        <div className={cn('rinklink-settings-footer', classNames?.footer)}>
          <div className={cn('rinklink-settings-instructions', classNames?.instructions)}>
            {mergedLocalization.CHANGE_PASSWORD_INSTRUCTIONS}
          </div>
          <Button
            type="submit"
            size="sm"
            className={cn('rinklink-settings-button rinklink-settings-button-primary', classNames?.button, classNames?.primaryButton)}
            disabled={accountsPending || isSubmitting}
          >
            {mergedLocalization.SAVE}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function SecuritySettingsCards({
  className,
  classNames,
  localization,
}: SecuritySettingsCardsProps) {
  const {
    credentials,
    deleteUser,
    genericOAuth,
    hooks,
    localization: contextLocalization,
    passkey,
    social,
    twoFactor,
  } = useContext(AuthUIContext);

  const mergedLocalization = { ...contextLocalization, ...localization };
  const { useListAccounts } = hooks;
  const { data: accounts, isPending: accountsPending, refetch: refetchAccounts } = useListAccounts();
  const credentialsLinked = accounts?.some((account) => account.providerId === 'credential');

  return (
    <div className={cn('flex w-full flex-col gap-4 md:gap-6', className, classNames?.cards)}>
      {credentials ? (
        <ChangePasswordCard
          accounts={accounts}
          accountsPending={accountsPending}
          classNames={classNames?.card}
          localization={mergedLocalization}
          refetchAccounts={refetchAccounts}
        />
      ) : null}

      {(social?.providers?.length || genericOAuth?.providers?.length) ? (
        <ProvidersCard
          accounts={accounts}
          classNames={classNames?.card}
          isPending={accountsPending}
          localization={mergedLocalization}
          refetch={refetchAccounts}
          skipHook
        />
      ) : null}

      {twoFactor && credentialsLinked ? (
        <TwoFactorCard
          classNames={classNames?.card}
          localization={mergedLocalization}
        />
      ) : null}

      {passkey ? (
        <PasskeysCard
          classNames={classNames?.card}
          localization={mergedLocalization}
        />
      ) : null}

      <SessionsCard classNames={classNames?.card} localization={mergedLocalization} />

      {deleteUser ? (
        <DeleteAccountCard
          accounts={accounts}
          classNames={classNames?.card}
          isPending={accountsPending}
          localization={mergedLocalization}
          skipHook
        />
      ) : null}
    </div>
  );
}
