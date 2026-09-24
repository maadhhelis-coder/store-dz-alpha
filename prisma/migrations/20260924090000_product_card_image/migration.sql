-- صورة بطاقة المنتج في قوائم المتجر (خانة في لوحة التحكم بدل خريطة ثابتة في الكود).
ALTER TABLE "products" ADD COLUMN "card_image_url" TEXT;

-- نقل الصورة المخصصة الوحيدة التي كانت مكتوبة في الكود (ProductCard.CARD_IMAGES) إلى القاعدة،
-- فيبقى المتجر الحيّ كما هو تمامًا بعد النشر. على قاعدة جديدة (CI) لا يطابق أي صف.
UPDATE "products" SET "card_image_url" = '/images/cards/pack-douche-robinet.jpg'
WHERE "slug" = 'pack-douche-robinet' AND "card_image_url" IS NULL;
