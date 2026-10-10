import { redirect } from "next/navigation";

// The old landing page is gone: the dashboard is the front door.
export default function Home() {
  redirect("/dashboard");
}
