import { Link } from "wouter";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  const { t, lang } = useLang();
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold font-display">{t.termsTitle}</h1>
        {lang === "vi" ? (
          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">Cập nhật lần cuối:</strong> {new Date().toLocaleDateString("vi-VN")}</p>
            <h2 className="text-foreground text-xl font-semibold">1. Chấp nhận điều khoản</h2>
            <p>Bằng cách sử dụng TTube, bạn đồng ý tuân thủ các điều khoản dịch vụ này. Nếu bạn không đồng ý, vui lòng không sử dụng dịch vụ.</p>
            <h2 className="text-foreground text-xl font-semibold">2. Mô tả dịch vụ</h2>
            <p>TTube là giao diện người dùng thứ ba cho phép xem nội dung YouTube thông qua API công khai. Chúng tôi không lưu trữ bất kỳ nội dung video nào trên máy chủ của mình.</p>
            <h2 className="text-foreground text-xl font-semibold">3. Tài khoản người dùng</h2>
            <p>Bạn chịu trách nhiệm bảo mật thông tin đăng nhập của mình. Vui lòng không chia sẻ mật khẩu với người khác và thông báo ngay cho chúng tôi nếu phát hiện truy cập trái phép.</p>
            <h2 className="text-foreground text-xl font-semibold">4. Sử dụng hợp pháp</h2>
            <p>Bạn đồng ý chỉ sử dụng dịch vụ cho mục đích hợp pháp. Nghiêm cấm sử dụng dịch vụ để vi phạm bản quyền hoặc vi phạm điều khoản sử dụng của YouTube.</p>
            <h2 className="text-foreground text-xl font-semibold">5. Giới hạn trách nhiệm</h2>
            <p>TTube được cung cấp "nguyên trạng" mà không có bất kỳ bảo đảm nào. Chúng tôi không chịu trách nhiệm về tính khả dụng liên tục của dịch vụ.</p>
            <h2 className="text-foreground text-xl font-semibold">6. Liên hệ</h2>
            <p>Mọi thắc mắc về điều khoản dịch vụ, vui lòng liên hệ qua trang web của chúng tôi.</p>
          </div>
        ) : (
          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">Last updated:</strong> {new Date().toLocaleDateString()}</p>
            <h2 className="text-foreground text-xl font-semibold">1. Acceptance of Terms</h2>
            <p>By using TTube, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.</p>
            <h2 className="text-foreground text-xl font-semibold">2. Service Description</h2>
            <p>TTube is a third-party interface that allows you to browse YouTube content via public APIs. We do not host any video content on our servers.</p>
            <h2 className="text-foreground text-xl font-semibold">3. User Accounts</h2>
            <p>You are responsible for keeping your login credentials secure. Do not share your password and notify us immediately if you suspect unauthorized access.</p>
            <h2 className="text-foreground text-xl font-semibold">4. Lawful Use</h2>
            <p>You agree to use the service only for lawful purposes. Using the service to infringe copyright or violate YouTube's Terms of Service is strictly prohibited.</p>
            <h2 className="text-foreground text-xl font-semibold">5. Limitation of Liability</h2>
            <p>TTube is provided "as is" without any warranties. We are not responsible for continuous availability of the service.</p>
            <h2 className="text-foreground text-xl font-semibold">6. Contact</h2>
            <p>For questions about these Terms, please contact us through our website.</p>
          </div>
        )}
      </div>
    </div>
  );
}
