import { AuthView } from '@daveyplate/better-auth-ui';
import { Navigate, useParams } from 'react-router-dom';

const allowedPathnames = new Set([
  'sign-in',
  'sign-up',
  'forgot-password',
  'reset-password',
  'sign-out',
  'settings',
  'callback',
]);

export default function AuthPage() {
  const { pathname = 'sign-in' } = useParams();

  if (!allowedPathnames.has(pathname)) {
    return <Navigate to="/auth/sign-in" replace />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        <AuthView pathname={pathname} />
      </div>
    </main>
  );
}
