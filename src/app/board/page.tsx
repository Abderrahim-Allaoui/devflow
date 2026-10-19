import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Board from "@/components/Board";

export const metadata = { title: "Board" };

export default async function BoardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/board");

  return <Board user={{ name: user.name }} />;
}
