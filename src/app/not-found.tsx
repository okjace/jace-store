import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-5xl font-black">404</h1>
      <p className="mt-2 text-muted">That page doesn&apos;t exist (or was deleted).</p>
      <Link href="/" className="btn-primary mt-6">Go home</Link>
    </div>
  );
}
