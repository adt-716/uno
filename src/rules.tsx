export function Rules() {
 return <section className="panel rules">
  <h2>Luật chơi Classic & Flip</h2>
  <p>Phòng online có sức chứa từ 2 đến 10 người do chủ phòng chọn, bắt đầu khi có ít nhất 2 người. Chơi với máy là bàn riêng gồm bạn và 3 máy; ván đầu bắt đầu ngay. Hai chế độ đều dùng cùng luật Classic hoặc Flip bên dưới. Máy chọn nước đi từ bài riêng và thông tin công khai, không xem bài ẩn của đối thủ; luôn hô UNO, chọn màu và nhận phạt tự động.</p>
  <p>Mỗi người 7 lá. Đến lượt, đánh 1 lá cùng màu, số hoặc ký hiệu với lá trên bàn; Wild cho phép chọn màu. Có thể chọn rút dù có bài đánh được. Sau khi rút, chỉ được đánh lá vừa rút hoặc bỏ lượt; lá rút không hợp lệ thì tự chuyển lượt. Không cộng dồn phạt, không đánh chen lượt.</p>
  <h3>Hô UNO và tính điểm</h3>
  <p>Ván mới chơi theo thứ hạng: người hết bài đầu tiên xếp nhất, những người còn lại tiếp tục để xác định hạng nhì, ba… Người đã có hạng không nhận thêm lượt hoặc bài phạt. Khi chỉ còn một người chưa hết bài, người đó xếp cuối và ván kết thúc. Lá Wild phạt cuối phải giải quyết nhận phạt/thách thức trước khi chốt hạng. Đây là biến thể của website; điểm thưởng cho người nhất vẫn chốt theo bài còn lại lúc họ về nhất, sau khi xử lý phạt.</p>
  <p>Luật phòng: khi đánh còn 1 lá, bạn có 5 giây bấm “UNO!”. Quá hạn chưa hô, server tự phạt rút 2 lá, kể cả khi bạn mất kết nối. Đồng hồ không mất khi người kế tiếp đánh; mỗi người có thời hạn riêng. Có thể bật “UNO tự động” để hô ngay cùng nước đánh. Cần hô trước khi đánh lá cuối. Đây là thời hạn riêng của website, thay cho cửa sổ bắt UNO theo lượt trong luật gốc. Hết bài là được chốt hạng; người nhất nhận điểm từ bài còn lại của đối thủ. Mốc 500 điểm được ghi nhận, ván vẫn chơi tiếp đến khi đủ thứ hạng.</p>
  <h3>Classic · 108 lá</h3>
  <ul>
   <li>Skip: người kế tiếp mất lượt. Reverse: đảo chiều; với 2 người, người đánh được đi tiếp.</li>
   <li>+2: người kế tiếp rút 2 lá và mất lượt. Wild: chọn một trong 4 màu.</li>
   <li>Wild +4 chỉ hợp lệ nếu không có lá cùng màu hiện tại. Người nhận có quyền thách thức: đúng thì người đánh rút 4 và người thách thức giữ lượt; sai thì người thách thức rút 6 và mất lượt.</li>
   <li>Điểm: lá số theo giá trị; Skip, Reverse, +2 là 20; Wild và Wild +4 là 50.</li>
  </ul>
  <h3>Flip · 112 lá hai mặt</h3>
  <p>Bắt đầu ở mặt sáng. Mỗi lá giữ nguyên cặp hai mặt suốt ván. Khi đánh Flip, lật tay bài của tất cả người chơi, đảo thứ tự và lật cả chồng rút lẫn chồng bỏ. Lá Flip vừa đánh nằm dưới cùng chồng bỏ; ký hiệu mới lộ ra không tự kích hoạt. Mặt ngược của bài đối thủ được hiển thị công khai.</p>
  <ul>
   <li>Mặt sáng: đỏ, vàng, xanh lá, xanh dương. +1 khiến người kế tiếp rút 1 và mất lượt; Skip, Reverse, Wild và Flip; Wild +2 hoạt động như Wild +4 của Classic nhưng phạt 2, thách thức sai phạt 4.</li>
   <li>Mặt tối: hồng, xanh ngọc, cam, tím. +5 khiến người kế tiếp rút 5 và mất lượt. Skip Everyone bỏ lượt tất cả đối thủ, người đánh đi tiếp. Có Reverse, Wild và Flip trở lại mặt sáng.</li>
   <li>Wild Draw Color: chọn màu; người kế tiếp rút tới khi có lá màu đó, giữ cả lá vừa trúng màu và mất lượt. Lá Wild không được tính là trúng màu.</li>
   <li>Wild Draw Color chỉ hợp lệ khi không có lá cùng màu hiện tại. Thách thức đúng: người đánh rút đến màu đã chọn, bạn giữ lượt. Thách thức sai: bạn rút đến màu đã chọn rồi thêm 2 lá, mất lượt.</li>
   <li>Điểm theo mặt đang chơi khi kết thúc: lá số theo giá trị; +1: 10; +5, Reverse, Skip, Flip: 20; Skip Everyone: 30; Wild: 40; Wild +2: 50; Wild Draw Color: 60.</li>
  </ul>
  <h3>Mở ván và lá cuối</h3>
  <p>Server tự rút chọn người chia bài bằng số cao nhất; người bên trái bắt đầu. Lá mở Skip bỏ lượt người đầu; Reverse cho người chia đi trước và đảo chiều; +2 Classic hoặc +1 Flip phạt người đầu rồi chuyển lượt. Wild thường để người đầu chọn màu; Wild +4 Classic / Wild +2 Flip được trả lại và rút lá khác.</p>
  <p>Nếu Flip xuất hiện khi mở ván, bàn chuyển sang mặt tối. Nếu lật lộ Wild, người đến lượt chọn màu trước khi đánh. Đây là cách xử lý quy ước của website cho tình huống bản hướng dẫn không mô tả riêng. Nếu không còn lá để rút dù đã tái sử dụng chồng bỏ, dừng rút ở số lá còn có.</p>
  <p>Lá phạt cuối vẫn được xử lý trước khi cộng điểm. Wild phạt cuối chờ nhận phạt hoặc thách thức rồi mới chốt kết quả. Chỉ người thách thức được xem bằng chứng tay bài.</p>
  <p className="asset-note">Bộ Flip của website dùng cách ghép riêng, cân bằng theo màu và nhóm lá. Có đủ 4 lá Wild Draw Color ở mặt tối. Cặp hai mặt không được tuyên bố giống bản in Mattel.</p>
  <p>Nguồn: <a href="https://service.mattel.com/instruction_sheets/W2085-Eng.pdf" target="_blank" rel="noreferrer">Mattel Classic</a> · <a href="https://service.mattel.com/instruction_sheets/GDR44-English.pdf" target="_blank" rel="noreferrer">Mattel Flip</a>.</p>
 </section>;
}
