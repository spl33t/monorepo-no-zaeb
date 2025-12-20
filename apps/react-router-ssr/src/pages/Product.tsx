import { useRouteContext } from '../context/RouteContext';
import type { ProductRouteContext } from '../routes';

export function Product() {
  const routeContext = useRouteContext<ProductRouteContext>();

  if (!routeContext || !routeContext.product) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>{routeContext.product.name}</h1>
      <p>{routeContext.product.description}</p>
      <p>Price: ${routeContext.product.price}</p>
    </div>
  );
}


