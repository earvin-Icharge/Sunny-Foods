// Store-app shell (static). Reuses the web portal's styles and client screens.
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "../../src/app/globals.css";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="en"><body className="min-h-screen bg-cream-light">
      <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>
    </body></html>
  );
}
