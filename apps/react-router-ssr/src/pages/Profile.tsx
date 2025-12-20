import { useRouteContext } from '../context/RouteContext';
import type { ProfileRouteContext } from '../routes';

export function Profile() {
  const routeContext = useRouteContext<ProfileRouteContext>();

  console.log('Profile component - routeContext:', routeContext);

  if (!routeContext || !routeContext.user || !routeContext.posts) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Profile: {routeContext.user.name}</h1>
      <p>Email: {routeContext.user.email}</p>
      <h2>Posts</h2>
      <ul>
        {routeContext.posts.map((post) => (
          <li key={post.id}>
            <h3>{post.title}</h3>
            <p>{post.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}


