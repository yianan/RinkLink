/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState } from 'react';

type NavBadgeContextType = {
  refreshKey: number;
  refreshNavBadges: () => void;
};

const NavBadgeContext = createContext<NavBadgeContextType>({ refreshKey: 0, refreshNavBadges: () => {} });

export function NavBadgeProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshNavBadges = useCallback(() => setRefreshKey((k) => k + 1), []);
  return (
    <NavBadgeContext.Provider value={{ refreshKey, refreshNavBadges }}>
      {children}
    </NavBadgeContext.Provider>
  );
}

export function useNavBadgeRefresh() {
  return useContext(NavBadgeContext).refreshNavBadges;
}

export function useNavBadgeKey() {
  return useContext(NavBadgeContext).refreshKey;
}
