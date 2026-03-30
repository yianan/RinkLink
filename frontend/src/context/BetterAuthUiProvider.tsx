import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import { useMemo, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { authClient, authEnabled } from '../lib/auth-client';
import { useToast } from './ToastContext';

function BetterAuthLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RouterLink to={href} className={className}>
      {children}
    </RouterLink>
  );
}

export function BetterAuthUiProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pushToast = useToast();

  const renderToast = useMemo(() => ({
    variant,
    message,
  }: {
    variant?: 'default' | 'success' | 'error' | 'info' | 'warning';
    message?: string;
  }) => {
    pushToast({
      variant: variant === 'default' || !variant ? 'info' : variant,
      title: message || 'Authentication update',
    });
  }, [pushToast]);

  if (!authEnabled) {
    return <>{children}</>;
  }

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={navigate}
      Link={BetterAuthLink}
      account={{ basePath: '/auth' }}
      toast={renderToast}
    >
      {children}
    </AuthUIProvider>
  );
}
