import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import type { ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { authClient, authEnabled } from '../lib/auth-client';

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

  if (!authEnabled) {
    return <>{children}</>;
  }

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={navigate}
      Link={BetterAuthLink}
      account={{ basePath: '/auth' }}
    >
      {children}
    </AuthUIProvider>
  );
}
