import { useState } from 'react';
import { useParams } from 'react-router-dom';

import AccountSettingsCards from '../components/settings/AccountSettingsCards';
import SecuritySettingsCards from '../components/settings/SecuritySettingsCards';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';

type SettingsTab = 'account' | 'security';

const settingsCardClassNames = {
  base: 'rinklink-settings-card',
  header: 'rinklink-settings-header',
  title: 'rinklink-settings-title',
  description: 'rinklink-settings-description',
  content: 'rinklink-settings-content',
  footer: 'rinklink-settings-footer',
  label: 'rinklink-settings-label',
  input: 'rinklink-settings-input',
  error: 'rinklink-settings-error',
  button: 'rinklink-settings-button',
  primaryButton: 'rinklink-settings-button-primary',
  secondaryButton: 'rinklink-settings-button-secondary',
  outlineButton: 'rinklink-settings-button-outline',
  destructiveButton: 'rinklink-settings-button-destructive',
  cell: 'rinklink-settings-cell',
  instructions: 'rinklink-settings-instructions',
  icon: 'rinklink-settings-icon',
  skeleton: 'rinklink-settings-skeleton',
  checkbox: 'rinklink-settings-checkbox',
  dialog: {
    content: 'rinklink-settings-dialog-content',
    header: 'rinklink-settings-dialog-header',
    footer: 'rinklink-settings-dialog-footer',
  },
} as const;

export default function SettingsPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const [tab, setTab] = useState<SettingsTab>(tabParam === 'security' ? 'security' : 'account');

  const tabs = [
    { label: 'Account', value: 'account' as const },
    { label: 'Security', value: 'security' as const },
  ];

  const handleTabChange = (nextTab: SettingsTab) => {
    setTab(nextTab);
    window.history.replaceState(null, '', nextTab === 'account' ? '/settings' : '/settings/security');
  };

  const pageMeta = tab === 'security'
    ? {
        subtitle: 'Manage your password, sign-in methods, active sessions, and account security.',
      }
    : {
        subtitle: 'Manage your profile details, email, and account information.',
      };

  return (
    <div className="rinklink-settings-page mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Settings"
        subtitle={pageMeta.subtitle}
        actions={(
          <SegmentedTabs
            items={tabs}
            value={tab}
            onChange={handleTabChange}
          />
        )}
      />

      <div className="grid gap-5">
        {tab === 'security' ? (
          <SecuritySettingsCards classNames={{ cards: 'grid gap-5', card: settingsCardClassNames }} />
        ) : (
          <AccountSettingsCards classNames={{ cards: 'grid gap-5', card: settingsCardClassNames }} />
        )}
      </div>
    </div>
  );
}
