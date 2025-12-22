export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080")
    ? import.meta.env.VITE_API_BASE_URL 
    : ""
}

console.log("API Base URL:", env.apiBaseUrl)
