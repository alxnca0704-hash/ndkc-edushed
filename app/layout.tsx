import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ClerkProvider } from "@clerk/nextjs";
import { ConfigProvider, type ThemeConfig } from "antd";

import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NDKC EduSched",
  description: "Class scheduling for NDKC",
};

const theme: ThemeConfig = {
  token: {
    colorPrimary: "#5b7cfa",
    colorInfo: "#5b7cfa",
    colorSuccess: "#7ca982",
    colorWarning: "#c99a3f",
    colorError: "#c96b5f",
    colorBgLayout: "#f8fafc",
    colorBgContainer: "#ffffff",
    colorTextBase: "#1f2937",
    colorBorder: "#e5e7eb",
    borderRadius: 8,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-gray-900">
        <ClerkProvider>
          <ConvexClientProvider>
            <AntdRegistry>
              <ConfigProvider theme={theme}>
                <div className="flex min-h-screen flex-col">
                  <main className="flex flex-1 flex-col">{children}</main>
                  <Toaster position="top-right" />
                </div>
              </ConfigProvider>
            </AntdRegistry>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}