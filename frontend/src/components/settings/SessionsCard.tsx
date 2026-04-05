import { AuthUIContext, type AuthLocalization } from '@daveyplate/better-auth-ui';
import type { Session } from 'better-auth';
import Bowser from 'bowser';
import { LaptopIcon, Loader2, SmartphoneIcon } from 'lucide-react';
import { useContext, useState } from 'react';

import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type CardClassNames = {
  base?: string;
  button?: string;
  cell?: string;
  content?: string;
  description?: string;
  footer?: string;
  header?: string;
  icon?: string;
  instructions?: string;
  outlineButton?: string;
  primaryButton?: string;
  title?: string;
};

type SessionsCardProps = {
  classNames?: CardClassNames;
  localization: AuthLocalization;
};

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function SessionRow({
  classNames,
  localization,
  session,
  onRefetch,
}: {
  classNames?: CardClassNames;
  localization: AuthLocalization;
  session: Session;
  onRefetch?: () => unknown;
}) {
  const {
    basePath,
    hooks: { useSession },
    mutators: { revokeSession },
    navigate,
    toast,
    viewPaths,
  } = useContext(AuthUIContext);

  const { data: sessionData } = useSession();
  const [loading, setLoading] = useState(false);
  const isCurrentSession = session.id === sessionData?.session?.id;
  const parsed = session.userAgent ? Bowser.parse(session.userAgent) : null;
  const isMobile = parsed?.platform.type === 'mobile';

  const handleAction = async () => {
    setLoading(true);

    if (isCurrentSession) {
      navigate(`${basePath}/${viewPaths.SIGN_OUT}`);
      return;
    }

    try {
      await revokeSession({ token: session.token });
      await onRefetch?.();
    } catch (error) {
      toast({
        variant: 'error',
        message: extractErrorMessage(error, 'Unable to revoke session.'),
      });
      setLoading(false);
    }
  };

  return (
    <Card className={cn('rinklink-settings-cell flex flex-row items-center gap-3 px-4 py-3', classNames?.cell)}>
      {isMobile ? (
        <SmartphoneIcon className={cn('h-4 w-4', classNames?.icon)} />
      ) : (
        <LaptopIcon className={cn('h-4 w-4', classNames?.icon)} />
      )}

      <div className="flex flex-col">
        <span className="text-sm font-semibold">
          {isCurrentSession ? localization.CURRENT_SESSION : session.ipAddress}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {session.userAgent?.includes('tauri-plugin-http')
            ? localization.APP
            : parsed?.os.name && parsed?.browser.name
              ? `${parsed.os.name}, ${parsed.browser.name}`
              : parsed?.os.name
                || parsed?.browser.name
                || session.userAgent
                || localization.UNKNOWN}
        </span>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="relative ms-auto shrink-0"
        disabled={loading}
        onClick={handleAction}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isCurrentSession ? localization.SIGN_OUT : localization.REVOKE}
      </Button>
    </Card>
  );
}

export default function SessionsCard({
  classNames,
  localization,
}: SessionsCardProps) {
  const {
    hooks: { useListSessions },
  } = useContext(AuthUIContext);

  const { data: sessions, isPending, refetch } = useListSessions();

  return (
    <Card className={cn('rinklink-settings-card w-full pb-0 text-start', classNames?.base)}>
      <div className={cn('rinklink-settings-header', classNames?.header)}>
        <h2 className={cn('rinklink-settings-title', classNames?.title)}>{localization.SESSIONS}</h2>
        <p className={cn('rinklink-settings-description', classNames?.description)}>{localization.SESSIONS_DESCRIPTION}</p>
      </div>

      <div className={cn('grid gap-4 px-6 pb-6', classNames?.content)}>
        {isPending ? (
          <Card className="rinklink-settings-cell px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
            Loading sessions...
          </Card>
        ) : (
          sessions?.map((session) => (
            <SessionRow
              key={session.id}
              classNames={classNames}
              localization={localization}
              session={session}
              onRefetch={refetch}
            />
          ))
        )}
      </div>
    </Card>
  );
}
