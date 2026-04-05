import {
  AuthUIContext,
  type AuthLocalization,
} from '@daveyplate/better-auth-ui';
import { useContext, useEffect, useMemo, useState, type FormEvent } from 'react';

import { cn } from '../../lib/cn';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';

type CardClassNames = {
  base?: string;
  header?: string;
  title?: string;
  description?: string;
  content?: string;
  footer?: string;
  label?: string;
  input?: string;
  error?: string;
  button?: string;
  primaryButton?: string;
  instructions?: string;
};

type AccountSettingsCardsProps = {
  className?: string;
  classNames?: {
    card?: CardClassNames;
    cards?: string;
  };
  localization?: Partial<AuthLocalization>;
};

type FieldErrors = {
  email?: string;
  name?: string;
};

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AccountSettingsCards({
  className,
  classNames,
  localization,
}: AccountSettingsCardsProps) {
  const {
    authClient,
    hooks: { useSession },
    localization: contextLocalization,
    mutators: { updateUser },
    toast,
  } = useContext(AuthUIContext);

  const mergedLocalization = useMemo(
    () => ({ ...contextLocalization, ...localization }),
    [contextLocalization, localization],
  );

  const { data: sessionData, isPending, refetch } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const user = sessionData?.user;

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setErrors({});
  }, [user?.email, user?.name]);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const initialName = user?.name?.trim() ?? '';
  const initialEmail = user?.email?.trim() ?? '';
  const nameChanged = trimmedName !== initialName;
  const emailChanged = trimmedEmail !== initialEmail;

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FieldErrors = {};
    if (!trimmedName) {
      nextErrors.name = 'Name is required.';
    }
    if (!trimmedEmail) {
      nextErrors.email = 'Email is required.';
    } else if (!isValidEmail(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    if (!nameChanged && !emailChanged) {
      toast({
        variant: 'info',
        message: 'No account changes to save.',
      });
      return;
    }

    setSaving(true);
    try {
      if (nameChanged) {
        await updateUser({ name: trimmedName });
      }

      if (emailChanged) {
        await authClient.changeEmail({
          newEmail: trimmedEmail,
          callbackURL: window.location.pathname,
          fetchOptions: { throw: true },
        });
      }

      await refetch?.();

      toast({
        variant: 'success',
        message: emailChanged
          ? (user?.emailVerified
              ? mergedLocalization.EMAIL_VERIFY_CHANGE ?? 'Check your email to verify the change.'
              : 'Account updated successfully.')
          : 'Account updated successfully.',
      });
    } catch (error) {
      const message = extractErrorMessage(error, 'Unable to update account settings.');
      toast({
        variant: 'error',
        message,
      });
      setErrors((current) => ({
        ...current,
        email: emailChanged ? message : current.email,
      }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('flex w-full flex-col gap-4 md:gap-6', className, classNames?.cards)}>
      <Card className={cn('rinklink-settings-card w-full pb-0 text-start', classNames?.card?.base)}>
        <div className={cn('rinklink-settings-header', classNames?.card?.header)}>
          <h2 className={cn('rinklink-settings-title', classNames?.card?.title)}>Account</h2>
        </div>

        <form method="POST" noValidate onSubmit={handleSave}>
          <div className={cn('rinklink-settings-content', classNames?.card?.content)}>
            <div className="grid gap-2">
              <label className={cn('rinklink-settings-label', classNames?.card?.label)} htmlFor="settings-name">
                Name
              </label>
              <Input
                id="settings-name"
                className={cn('rinklink-settings-input', classNames?.card?.input)}
                disabled={isPending || saving}
                placeholder="Name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (errors.name) {
                    setErrors((current) => ({ ...current, name: undefined }));
                  }
                }}
              />
              {errors.name ? <div className={cn('rinklink-settings-error px-3 py-2 text-sm', classNames?.card?.error)}>{errors.name}</div> : null}
            </div>

            <div className="grid gap-2">
              <label className={cn('rinklink-settings-label', classNames?.card?.label)} htmlFor="settings-email">
                Email
              </label>
              <Input
                id="settings-email"
                className={cn('rinklink-settings-input', classNames?.card?.input)}
                disabled={isPending || saving}
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (errors.email) {
                    setErrors((current) => ({ ...current, email: undefined }));
                  }
                }}
              />
              {errors.email ? <div className={cn('rinklink-settings-error px-3 py-2 text-sm', classNames?.card?.error)}>{errors.email}</div> : null}
            </div>
          </div>

          <div className={cn('rinklink-settings-footer', classNames?.card?.footer)}>
            <Button
              type="submit"
              size="sm"
              className={cn('rinklink-settings-button rinklink-settings-button-primary', classNames?.card?.button, classNames?.card?.primaryButton)}
              disabled={isPending || saving}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Card>

      {user && !user.emailVerified ? (
        <Card className={cn('rinklink-settings-card w-full pb-0 text-start', classNames?.card?.base)}>
          <div className={cn('rinklink-settings-header', classNames?.card?.header)}>
            <h2 className={cn('rinklink-settings-title', classNames?.card?.title)}>{mergedLocalization.VERIFY_YOUR_EMAIL}</h2>
            <p className={cn('rinklink-settings-description', classNames?.card?.description)}>{mergedLocalization.VERIFY_YOUR_EMAIL_DESCRIPTION}</p>
          </div>
          <div className={cn('rinklink-settings-content', classNames?.card?.content)}>
            <Alert variant="info">Verification is still pending for {user.email}.</Alert>
          </div>
          <div className={cn('rinklink-settings-footer', classNames?.card?.footer)}>
            <div className={cn('rinklink-settings-instructions', classNames?.card?.instructions)}>
              Use this if you did not receive the original verification email.
            </div>
            <Button
              type="button"
              size="sm"
              className={cn('rinklink-settings-button rinklink-settings-button-primary', classNames?.card?.button, classNames?.card?.primaryButton)}
              disabled={resending}
              onClick={async () => {
                setResending(true);
                try {
                  await authClient.sendVerificationEmail({
                    email: user.email,
                    fetchOptions: { throw: true },
                  });
                  toast({
                    variant: 'success',
                    message: mergedLocalization.EMAIL_VERIFY_CHANGE ?? 'Verification email sent.',
                  });
                } catch (error) {
                  toast({
                    variant: 'error',
                    message: extractErrorMessage(error, 'Unable to resend verification email.'),
                  });
                } finally {
                  setResending(false);
                }
              }}
            >
              {mergedLocalization.RESEND_VERIFICATION_EMAIL}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
