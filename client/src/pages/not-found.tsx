import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Ghost, Home } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6 px-4">
        <div className="relative">
          <Ghost className="w-24 h-24 text-primary/20 animate-bounce" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-display font-bold">404</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-display font-bold">Trang không tồn tại</h1>
          <p className="text-muted-foreground max-w-md">
            Có vẻ như video hoặc trang bạn đang tìm kiếm đã bị di chuyển hoặc không còn tồn tại.
          </p>
        </div>

        <Button asChild className="rounded-full px-8" size="lg">
          <Link href="/">
            <Home className="w-4 h-4 mr-2" />
            Quay lại trang chủ
          </Link>
        </Button>
      </div>
    </Layout>
  );
}
