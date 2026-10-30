import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles.css";

// Split per route so the phone remote loads without MediaPipe or pdf.js.
const Home = lazy(() => import("./routes/Home"));
const Present = lazy(() => import("./routes/Present"));
const Remote = lazy(() => import("./routes/Remote"));
const Lab = lazy(() => import("./routes/Lab"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/present" element={<Present />} />
          <Route path="/r/:id" element={<Remote />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
