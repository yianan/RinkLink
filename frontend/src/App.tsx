import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Box, Container, Drawer, List,
  ListItemButton, ListItemIcon, ListItemText, CssBaseline,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import HomeIcon from '@mui/icons-material/Home';
import GroupsIcon from '@mui/icons-material/Groups';
import PeopleIcon from '@mui/icons-material/People';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SearchIcon from '@mui/icons-material/Search';
import MailIcon from '@mui/icons-material/Mail';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import { TeamProvider } from './context/TeamContext';
import TeamSwitcher from './components/TeamSwitcher';
import HomePage from './pages/HomePage';
import AssociationListPage from './pages/AssociationListPage';
import TeamListPage from './pages/TeamListPage';
import SchedulePage from './pages/SchedulePage';
import SearchPage from './pages/SearchPage';
import ProposalsPage from './pages/ProposalsPage';
import WeeklyConfirmPage from './pages/WeeklyConfirmPage';
import RinkListPage from './pages/RinkListPage';
import IceSlotsPage from './pages/IceSlotsPage';

const DRAWER_WIDTH = 220;

const theme = createTheme({
  palette: {
    primary: { main: '#1565c0' },
    secondary: { main: '#00838f' },
  },
});

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: <HomeIcon /> },
  { path: '/associations', label: 'Associations', icon: <GroupsIcon /> },
  { path: '/teams', label: 'Teams', icon: <PeopleIcon /> },
  { path: '/schedule', label: 'Schedule', icon: <CalendarMonthIcon /> },
  { path: '/search', label: 'Find Opponents', icon: <SearchIcon /> },
  { path: '/proposals', label: 'Proposals', icon: <MailIcon /> },
  { path: '/rinks', label: 'Rinks', icon: <AcUnitIcon /> },
  { path: '/confirm', label: 'Weekly Confirm', icon: <CheckCircleIcon /> },
];

function NavDrawer() {
  const location = useLocation();
  return (
    <Drawer variant="permanent" sx={{
      width: DRAWER_WIDTH, flexShrink: 0,
      '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', top: 64 },
    }}>
      <List>
        {NAV_ITEMS.map((item) => (
          <ListItemButton key={item.path} component={Link} to={item.path}
            selected={item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)}>
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
}

function AppContent() {
  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            RinkLink
          </Typography>
          <TeamSwitcher />
        </Toolbar>
      </AppBar>
      <NavDrawer />
      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8, ml: `${DRAWER_WIDTH}px` }}>
        <Container maxWidth="lg">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/associations" element={<AssociationListPage />} />
            <Route path="/teams" element={<TeamListPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/proposals" element={<ProposalsPage />} />
            <Route path="/rinks" element={<RinkListPage />} />
            <Route path="/rinks/:rinkId/slots" element={<IceSlotsPage />} />
            <Route path="/confirm" element={<WeeklyConfirmPage />} />
          </Routes>
        </Container>
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <TeamProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TeamProvider>
    </ThemeProvider>
  );
}
