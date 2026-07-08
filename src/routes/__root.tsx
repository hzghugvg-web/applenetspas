import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PlatformGate } from "@/components/PlatformGate";
import { AlertHost } from "@/lib/alert";
import { installNetworkResilience } from "@/lib/network-resilience";
import { supabase } from "@/integrations/supabase/client";

installNetworkResilience();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" },
      { title: "NetSpas — бесплатные VPN-конфигурации" },
      { name: "description", content: "NetSpas — менеджер бесплатных VPN-конфигураций VLESS." },
      { name: "theme-color", content: "#17212B" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { property: "og:title", content: "NetSpas — бесплатные VPN-конфигурации" },
      { property: "og:description", content: "NetSpas — менеджер бесплатных VPN-конфигураций VLESS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "NetSpas — бесплатные VPN-конфигурации" },
      { name: "twitter:description", content: "NetSpas — менеджер бесплатных VPN-конфигураций VLESS." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/638dbf7c-8ffa-46f3-a3cf-7a709f9a64b7/id-preview-ec6ad29a--ed9f7dd2-7f21-47ed-a753-4b310a83f304.lovable.app-1782841873644.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/638dbf7c-8ffa-46f3-a3cf-7a709f9a64b7/id-preview-ec6ad29a--ed9f7dd2-7f21-47ed-a753-4b310a83f304.lovable.app-1782841873644.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=localStorage.getItem('ns_mode');var t=localStorage.getItem('ns_theme');var legacy=t;if(m!=='light'&&m!=='dark'){m=(legacy==='light')?'light':'dark';}if(t!=='midnight'&&t!=='sunset'&&t!=='forest'&&t!=='candy'){t=(legacy==='neon')?'candy':'midnight';}document.documentElement.dataset.mode=m;document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',m==='dark');}catch(e){}",
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    import("@/lib/theme").then((m) => m.initThemeFromStorage());
  }, []);

  // Reset cached data whenever the signed-in user changes so a new account
  // doesn't see the previous user's VPN / profile data until a manual reload.
  useEffect(() => {
    let currentUserId: string | null | undefined;
    supabase.auth.getSession().then(({ data }) => {
      currentUserId = data.session?.user?.id ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId === currentUserId) return;
      currentUserId = nextUserId;
      queryClient.clear();
      router.invalidate();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  useEffect(() => {
    const isProtectedTouchTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest("[data-allow-touch],button,a,input,textarea,select,[role='button']"));
    };

    let startX = 0, startY = 0, edge = false;
    const onTouchStart = (e: TouchEvent) => {
      if (isProtectedTouchTarget(e.target)) return;
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX; startY = t.clientY;
      edge = t.clientX < 32 || t.clientX > window.innerWidth - 32;
      if (edge) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isProtectedTouchTarget(e.target)) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (edge || (dx > dy && dx > 8)) {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-allow-hscroll]")) return;
        e.preventDefault();
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PlatformGate>
        <Outlet />
      </PlatformGate>
      <AlertHost />
    </QueryClientProvider>
  );
}
