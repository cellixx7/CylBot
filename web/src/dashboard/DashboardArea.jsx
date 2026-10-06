import { getGuilds } from './dashboardApi.js';
import { useReadPolling } from '../lib/useReadPolling.js';
import Dashboard from './Dashboard.jsx';
import ServerWorkspace from './server/ServerWorkspace.jsx';

// Keep a single guild dataset and polling cycle across selection and server routes.
export default function DashboardArea({ user, serverRoute, requireRelogin }) {
  const state = useReadPolling(getGuilds, requireRelogin, 60000);
  return serverRoute
    ? <ServerWorkspace key={serverRoute.guildId} route={serverRoute} state={state} requireRelogin={requireRelogin} />
    : <Dashboard user={user} state={state} />;
}
