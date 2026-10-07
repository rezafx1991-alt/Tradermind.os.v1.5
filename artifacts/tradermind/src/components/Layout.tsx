import { Sidebar } from "./Sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/*
        دسکتاپ: padding-right برای sidebar (RTL) + بدون نوار بالا/پایین
        موبایل: padding-top برای نوار بالا + padding-bottom برای bottom nav
      */}
      <main
        className="md:pr-64 pt-14 md:pt-0 min-h-[100dvh] flex flex-col"
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        {/* روی دسکتاپ padding bottom را حذف می‌کنیم */}
        <style>{`@media (min-width: 768px) { main { padding-bottom: 0 !important; } }`}</style>
        <div className="tradermind-page-shell flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
