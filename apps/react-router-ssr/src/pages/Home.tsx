import { homePage } from "../routes"

export const HomePage = homePage.defineView(({ appContext, pageContext }) => {
  if(pageContext.type === "ok") {
    return <div>Home. <br /> Current user: ${appContext.userId}</div>
  }
  return null;
});