import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import LotteryPage from "./pages/LotteryPage";
import ProspectRankingsPage from "./pages/ProspectRankingsPage";
import FullOrderPage from "./pages/FullOrderPage";
import PickOddsPage from "./pages/PickOddsPage";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LotteryPage />} />
          <Route path="/draft" element={<LotteryPage />} />
          <Route path="/prospects" element={<ProspectRankingsPage />} />
          <Route path="/full-order" element={<FullOrderPage />} />
          <Route path="/pick-odds" element={<PickOddsPage />} />
        </Route>
      </Routes>
      <Analytics />
    </BrowserRouter>
  );
}