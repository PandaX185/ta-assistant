import { Outlet } from "react-router-dom";
import Sidebar from "./sidebar";
import BottomNav from "./bottom-nav";
import TopBar from "./top-bar";
import FilterBar from "./filter-bar";

export default function Shell() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <FilterBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
