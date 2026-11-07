# UNO Club

React + TypeScript + Vite + Tailwind CSS, Node.js + Socket.IO, PostgreSQL. Classic và Flip có phòng online 2–10 người, hoặc bàn riêng gồm bạn và 3 máy. Chọn chế độ khi tạo phòng; người tham gia theo chế độ của phòng.

## Chạy local

1. `npm install`
2. Tạo database PostgreSQL và user riêng có quyền tạo bảng trong database đó. Điền `DATABASE_URL` trong `.env` (đã được gitignore). Mẫu nằm trong `.env.example`. Mật khẩu chứa ký tự đặc biệt cần URL-encode.
3. `npm run db:migrate`
4. `npm run dev`
5. Mở http://localhost:5173. Tạo phòng, mở cửa sổ ẩn danh để vào bằng mã phòng và kiểm tra 2 người chơi. Mỗi trình duyệt/profile có một phiên lưu trong localStorage.

Chơi trên điện thoại cùng Wi-Fi: mở địa chỉ IP LAN của máy chủ, cổng 5173. Socket.IO và ảnh được Vite proxy về backend. Nếu Windows Firewall chặn, cho phép cổng dev phù hợp trên mạng riêng.

## Kiểm tra và bản build

`npm test` chạy 55 kiểm thử luật, bộ ảnh, quyền xem bài, quyết định máy và mô phỏng trọn ván 2/4/10 ghế qua các lần serialize JSON. `npm run test:integration` cần PostgreSQL đã migrate: tạo phòng riêng, chơi hết Classic/Flip qua Socket.IO, kiểm tra khôi phục phiên, version, thao tác đồng thời, giới hạn 2/10 người lượt máy tự chạy và phạt UNO sau 5 giây khi mất kết nối; tự xóa các phòng do bài kiểm thử tạo ra. `npm run build` kiểm tra TypeScript và tạo frontend production. `npm start` phục vụ frontend build và Socket.IO cùng cổng 3001. Khi deploy đặt CLIENT_ORIGIN đúng URL frontend; dùng HTTPS và PostgreSQL có TLS theo cấu hình nhà cung cấp.

## PostgreSQL là nguồn dữ liệu chính

- `rooms`: toàn bộ trạng thái ván JSONB (tay bài, chồng rút, chồng bỏ, lượt, chủ phòng, kết quả) và version.
- `player_sessions`: hash token phiên, ID người chơi, phòng. Token gốc chỉ trả về trình duyệt; không dùng socket ID làm danh tính.
- `game_events`: lịch sử thao tác có version, ghi cùng transaction với trạng thái.
- Mỗi thao tác dùng một connection với BEGIN, SELECT FOR UPDATE, kiểm tra version/luật, UPDATE + INSERT event rồi COMMIT. Socket.IO chỉ phát sau commit. Không có Map hay cache RAM chứa trạng thái phòng. Server chỉ giữ kết nối và metadata truyền tải trong bộ nhớ; trạng thái được đọc từ PostgreSQL mỗi yêu cầu.
- Server tạo bản chiếu riêng cho từng người, không gửi bài mặt đang chơi của đối thủ hay thứ tự chồng rút. Flip công khai mặt ngược bài đối thủ và mặt ngược lá trên cùng chồng rút theo cách chơi hai mặt. Bằng chứng thách thức chỉ gửi người thách thức. Tải lại trang hoặc khởi động lại server có thể resume bằng token đã lưu.
- Chế độ, mặt sáng/tối, cửa sổ bắt UNO, chọn màu, phạt chờ thách thức, bằng chứng riêng, điểm và vòng đấu đều nằm trong JSONB. Không cần migration mới cho bản luật này; phòng Classic cũ được bổ sung giá trị mặc định khi đọc/xử lý, không xóa ván cũ. Điểm các ván cũ chưa được tính sẽ không được cộng hồi tố.
- Backend hiện chạy một instance; nếu chạy nhiều instance cần cơ chế phân phối Socket.IO và thông báo liên instance. PostgreSQL vẫn là nguồn dữ liệu chính.

## Luật hiện tại

### Giao diện vừa màn hình

Màn chơi dùng `100dvh`: thanh đầu, bàn tự co và tay bài ở các vùng cố định. Màn ngang thấp đưa tay bài sang cột bên phải; nhiều bài cuộn trong tay bài, không cuộn toàn trang. Luật, diễn biến, điểm, chọn màu, nhận phạt/thách thức và bằng chứng mở trong dialog có quản lý focus. Bấm số người trên bàn để xem danh sách và mặt ngược công khai khi bàn nhỏ ẩn quạt bài. Sảnh tạo phòng cũng được nén để vừa màn nhỏ. Deadline UNO lưu trong JSONB; worker PostgreSQL phân xử tự động, giao diện chỉ đếm ngược theo thời gian server.

### Chơi với máy và phòng online

Tạo lại bộ Flip bằng `npm run cards:build`; kết quả cố định theo seed, chính sách và checksum trong `img/flip_pairing_policy.json`. Có đủ 4 Wild Draw Color mặt tối, mỗi lá ghép với một lá số thuộc màu sáng khác nhau. Các kiểm thử `server/flip-deck.test.ts` xác nhận phân bố, cặp không trùng và nhận phạt/thách thức theo đủ bốn màu tối. Bộ ghép mới áp dụng từ ván mới; các lá của ván đang chơi đã lưu trọn hai mặt trong PostgreSQL nên không bị đổi giữa ván.

- **Bạn bè**: chủ phòng chọn sức chứa từ 2 đến 10; đủ 2 người đã có thể bắt đầu. Server khóa dòng phòng khi tham gia, ngăn vượt sức chứa dù nhiều người vào đồng thời.
- **Chơi với máy**: bàn 4 ghế (1 người + 3 máy), tự chia bài khi tạo. Không cho người khác tham gia bằng mã. Có thể chơi Classic hoặc Flip, ván sau vẫn giữ 3 máy.
- Máy dùng bản chiếu riêng giống người chơi: không biết chồng rút, tay bài ẩn hay tính hợp lệ bí mật của Wild đối thủ. Máy ưu tiên lá có tác dụng/điểm cao, giữ Wild khi còn lựa chọn khác, chọn màu có nhiều trên tay, tránh Wild phạt sai luật, luôn hô UNO, tự chọn màu và nhận phạt. Đây là máy chiến thuật cơ bản; chưa có độ khó và chưa chủ động thách thức Wild.
- Worker kiểm tra lượt máy đến hạn trong PostgreSQL, khóa `FOR UPDATE SKIP LOCKED`, ghi trạng thái + sự kiện trong cùng transaction rồi phát Socket.IO. Mỗi nước máy có nhịp khoảng 0,85 giây. Không giữ ván trong RAM; `botNextAt`, danh tính máy, chế độ và sức chứa đều ở JSONB. Khởi động lại server hoặc người chơi rớt mạng vẫn xử lý tiếp tới lượt người.
- Không cần migration bổ sung: phòng cũ được coi là online, sức chứa 10. Bàn chơi bố trí ghế quanh mặt bàn tròn, xoay góc nhìn để bạn luôn ở dưới; chồng bài ở giữa. Phòng đông trên điện thoại dùng bàn oval để đủ chỗ cho 10 ghế. Bấm chồng bài nhỏ của đối thủ Flip để xem đủ các mặt ngược công khai.

Nút **Luật chơi** trên website giải thích Classic và Flip, thách thức, mở ván và điểm. Không cộng dồn phạt. Rút một lá rồi chỉ đánh lá vừa rút hoặc bỏ lượt; lá không hợp lệ tự chuyển lượt. Luật phòng tùy chỉnh: còn 1 lá có 5 giây để hô UNO; quá hạn server tự phạt 2 lá, kể cả khi mất kết nối. Mỗi người có deadline riêng, không bị xóa khi người khác bắt đầu lượt. Không được bắt sớm; có thể bật UNO tự động để hô ngay kèm nước đánh. Cần hô trước khi đánh lá cuối. Reverse hai người tương đương Skip. Server tự rút chọn người chia bài và xử lý lá đặc biệt khi mở ván.

Classic dùng 108 lá. Flip dùng 112 lá có cặp hai mặt cố định từ JSON: +1 và Wild +2 mặt sáng; +5, Skip Everyone và Wild Draw Color mặt tối. Flip đảo thứ tự cả hai chồng bài và đổi mặt tay bài; ký hiệu mới lộ không tự kích hoạt. Wild phạt có bước nhận phạt/thách thức. Có thể bluff bằng Wild phạt khi còn màu phù hợp; server lưu tính hợp lệ bí mật tại thời điểm đánh, chỉ phân xử khi thách thức. Lá phạt cuối được xử lý trước khi chốt điểm. Cộng điểm theo mặt đang chơi, đạt 500 thắng trận; ván sau giữ điểm, trận mới sau khi có người thắng reset điểm.

Quy ước cho tình huống hướng dẫn không mô tả riêng: mở ván gặp Flip thì lật sang tối; lật lộ Wild thì người đến lượt chọn màu và không kích hoạt phạt của mặt mới. Khi không còn lá để rút kể cả tái sử dụng chồng bỏ, dừng ở số bài còn có. Bộ Flip dùng cách ghép cân bằng riêng UNO Club: mỗi nhóm màu sáng nhận 6 lá của mỗi màu tối, 1 Wild tối và 1 Wild Draw Color; hai lá sáng giống nhau có màu tối khác nhau. Không có cặp số giống nhau hai mặt hoặc Flip/Flip. Đây không phải bản sao ghép mặt của bộ Mattel.

Nguồn luật: [Mattel Classic W2085](https://service.mattel.com/instruction_sheets/W2085-Eng.pdf), [Mattel Flip GDR44](https://service.mattel.com/instruction_sheets/GDR44-English.pdf).

Chưa có tài khoản, chọn độ khó máy, quản lý rời/kick phòng hay dọn phòng hết hạn. Nút **Về sảnh** chỉ chuyển giao diện, không xóa chỗ trong phòng; có thể quay lại phiên trước cho đến khi tạo/vào phòng khác. Người đã vào giữ chỗ để reconnect; chủ phòng phải có mặt để bắt đầu ván mới. Cần bổ sung vòng đời phòng trước khi mở dịch vụ công khai.

Ảnh hiện có được giữ nguyên, phục vụ tại `/img`. Chỉ dùng ảnh lá riêng, không dùng concept sheet làm dữ liệu luật.



Ván mới dùng placements lưu trong JSONB: tiếp tục sau người hết bài đầu tiên để xác định đủ thứ hạng. Người đã xếp hạng bị bỏ qua khi tính lượt; Reverse khi chỉ còn hai người hoạt động như bàn hai người. Ván cũ chưa có placements giữ luật kết thúc cũ đến lần chia tiếp theo. Điểm cho người nhất chốt tại lúc họ hết bài, sau giải quyết lá phạt cuối.
