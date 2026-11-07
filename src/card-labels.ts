import type { PublicCard } from '../shared/types';

export const labels: Record<string, string> = {
 red: 'Đỏ', yellow: 'Vàng', green: 'Xanh lá', blue: 'Xanh dương', pink: 'Hồng', teal: 'Xanh ngọc',
 orange: 'Cam', purple: 'Tím', wild: 'Đổi màu', skip: 'Bỏ lượt', reverse: 'Đổi chiều',
 draw_two: '+2', wild_draw_four: 'Wild +4', draw_one: '+1', wild_draw_two: 'Wild +2',
 draw_five: '+5', skip_everyone: 'Bỏ lượt tất cả', wild_draw_color: 'Rút đến màu', flip: 'Flip',
};
export const cardName = (c: PublicCard) => labels[c.color] + ' · ' + (labels[c.value] ?? c.value.replace('number_', ''));
