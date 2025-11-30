// GET token
export function getToken() {
  return localStorage.getItem("token");
}

// SET token
export function setToken(token: string) {
  localStorage.setItem("token", token);
}

// CLEAR token
export function clearToken() {
  localStorage.removeItem("token");
}
