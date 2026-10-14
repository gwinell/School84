import { getMyWishlistCourses } from "@/app/data/user/get-wishlist-courses";
import { WISHLIST_PAGE_SIZE } from "@/lib/constants/wishlist";

import { WishlistList } from "./_components/WishlistList";

export const metadata = {
  title: "Wishlist | SchoolSphere",
  description: "Courses you've saved for later.",
};

export default async function WishlistPage() {
  const initialPage = await getMyWishlistCourses({
    page: 1,
    pageSize: WISHLIST_PAGE_SIZE,
  });

  return (
    <div className="flex flex-1 flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Wishlist</h2>
        <p className="text-sm text-muted-foreground">
          Courses you&apos;ve saved to revisit later.
        </p>
      </div>

      <WishlistList initialPage={initialPage} />
    </div>
  );
}
