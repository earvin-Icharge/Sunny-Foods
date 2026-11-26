import Link from "next/link";
import Image from "next/image";

// Shown only on a plain address (computer testing / preview links).
// Real users go straight to app., order. or agent. sunnyfoods.com.ph.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <Image src="/logo.png" alt="Sunny Foods" width={1200} height={615} priority className="h-auto w-80 sm:w-96" />
      <div className="grid w-full gap-3">
        <Link className="btn-primary" href="/staff">Staff app</Link>
        <Link className="btn-secondary" href="/portal">Customer ordering</Link>
        <Link className="btn-secondary" href="/agent">Agent portal</Link>
      </div>
    </main>
  );
}
