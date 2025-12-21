import { profilePage } from "../routes"

export const ProfilePage = profilePage.defineView(({ appContext, pageContext, params }) => {
  if (pageContext.type === "ok") {
    return <div>Profile {pageContext.data.profileId}</div>
  }
  if (pageContext.type === "not-found") {
    return <div>{pageContext.data.message}</div>
  }
  return null;
});
