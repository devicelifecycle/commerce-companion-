import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { logger } from "./lib/logger";

window.addEventListener('unhandledrejection', (event) => {
  logger.error('unhandled_rejection', event.reason);
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  logger.error('uncaught_error', event.error, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
  });
});

createRoot(document.getElementById("root")!).render(<App />);
