import { Link } from "wouter";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  const { t, lang } = useLang();
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold font-display">{t.privacyTitle}</h1>
        {lang === "vi" ? (
          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">Cập nhật lần cuối:</strong> {new Date().toLocaleDateString("vi-VN")}</p>
            <h2 className="text-foreground text-xl font-semibold">1. Thông tin chúng tôi thu thập</h2>
            <p>Chúng tôi thu thập thông tin bạn cung cấp khi đăng ký tài khoản (tên người dùng, email, mật khẩu đã mã hóa). Chúng tôi cũng lưu trữ dữ liệu sử dụng như danh sách yêu thích, lịch sử xem và cài đặt.</p>
            <h2 className="text-foreground text-xl font-semibold">2. Cách chúng tôi sử dụng thông tin</h2>
            <p>Thông tin được sử dụng để cung cấp và cải thiện dịch vụ, đồng bộ dữ liệu của bạn giữa các thiết bị, và liên lạc với bạn khi cần thiết.</p>
            <h2 className="text-foreground text-xl font-semibold">3. Bảo mật dữ liệu</h2>
            <p>Mật khẩu của bạn được mã hóa bằng bcrypt. Chúng tôi sử dụng JWT token để xác thực. Dữ liệu được lưu trữ trên máy chủ MySQL bảo mật.</p>
            <h2 className="text-foreground text-xl font-semibold">4. Chia sẻ dữ liệu</h2>
            <p>Chúng tôi không bán hoặc chia sẻ thông tin cá nhân của bạn với bên thứ ba. Chúng tôi sử dụng proxy để ẩn địa chỉ IP của bạn khi truy cập YouTube.</p>
            <h2 className="text-foreground text-xl font-semibold">5. Quyền của bạn</h2>
            <p>Bạn có quyền truy cập, sửa đổi hoặc xóa dữ liệu cá nhân của mình bất kỳ lúc nào thông qua trang Cài đặt.</p>
            <h2 className="text-foreground text-xl font-semibold">6. Cookie</h2>
            <p>Chúng tôi sử dụng localStorage để lưu trữ token xác thực và tùy chọn ngôn ngữ. Không có cookie theo dõi của bên thứ ba.</p>
          </div>
        ) : (
          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">Last updated:</strong> {new Date().toLocaleDateString()}</p>
            <h2 className="text-foreground text-xl font-semibold">1. Information We Collect</h2>
            <p>We collect information you provide when registering (username, email, encrypted password). We also store usage data such as favorites, watch history, and settings.</p>
            <h2 className="text-foreground text-xl font-semibold">2. How We Use Information</h2>
            <p>Information is used to provide and improve the service, sync your data across devices, and communicate with you when necessary.</p>
            <h2 className="text-foreground text-xl font-semibold">3. Data Security</h2>
            <p>Passwords are hashed with bcrypt. We use JWT tokens for authentication. Data is stored on a secure MySQL server.</p>
            <h2 className="text-foreground text-xl font-semibold">4. Data Sharing</h2>
            <p>We do not sell or share your personal information with third parties. We use proxies to mask your IP when accessing YouTube.</p>
            <h2 className="text-foreground text-xl font-semibold">5. Your Rights</h2>
            <p>You have the right to access, modify, or delete your personal data at any time through the Settings page.</p>
            <h2 className="text-foreground text-xl font-semibold">6. Cookies</h2>
            <p>We use localStorage to store your auth token and language preference. No third-party tracking cookies.</p>
          </div>
        )}
      </div>
    </div>
  );
}
