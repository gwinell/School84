import { NotFoundView } from "@/components/general/NotFoundView";

export default function PublicNotFound() {
  return (
    <NotFoundView
      title="We couldn't find that page"
      description="This course or page doesn't exist, or it may have been unpublished by its instructor."
      backHref="/login"
      backLabel="Browse courses"
    />
  );
}
