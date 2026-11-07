import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export default function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-start justify-center py-16">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-5xl text-olive">This page found another life elsewhere.</h1>
      <Link to="/" className="mt-8"><Button data-testid="notfound-home-btn">Back home</Button></Link>
    </div>
  );
}
