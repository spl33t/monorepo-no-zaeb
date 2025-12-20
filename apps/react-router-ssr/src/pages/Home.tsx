import { useRouteContext } from '../context/RouteContext';
import type { HomeRouteContext } from '../routes';

export function Home() {
  const routeContext = useRouteContext<HomeRouteContext>();

  return (
    <div>
      <h1>Home</h1>
      <p>{routeContext?.message || 'Loading...'}</p>
    </div>
  );
}


