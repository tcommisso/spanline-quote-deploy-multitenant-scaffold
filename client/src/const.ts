export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Use a server-side login dispatcher so production auth mode does not depend on
// Vite build-time variables being injected into the browser bundle.
export const getLoginUrl = () => {
  return "/api/auth/login";
};
