CREATE TABLE IF NOT EXISTS "restaurant_settings_kv" (
  "id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_settings_kv_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_settings_kv_restaurant_id_key" ON "restaurant_settings_kv"("restaurant_id");
ALTER TABLE "restaurant_settings_kv" ADD CONSTRAINT "restaurant_settings_kv_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
