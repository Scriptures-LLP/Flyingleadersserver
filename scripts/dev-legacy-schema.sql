-- Fallback legacy schema for local development of the MySQL sync (module E),
-- reconstructed from reading flyingdotcom's PHP source (no .sql schema file
-- exists in that codebase). Use this ONLY until the client's real .sql dump
-- is available — once you have the real dump, import that instead and drop
-- this file's tables first (`DROP DATABASE flyingleader_dev; CREATE DATABASE ...`).
--
-- Load with: mysql flyingleader_dev < scripts/dev-legacy-schema.sql

CREATE TABLE IF NOT EXISTS countries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(190) DEFAULT NULL,
  cover_image VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS airports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  name VARCHAR(190) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tours (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  slug VARCHAR(190) DEFAULT NULL,
  short_desc TEXT,
  full_desc LONGTEXT,
  location VARCHAR(190) DEFAULT NULL,
  duration VARCHAR(64) DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_child DECIMAL(10,2) DEFAULT NULL,
  price_infant DECIMAL(10,2) DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  itinerary LONGTEXT,
  inclusions LONGTEXT,
  exclusions LONGTEXT,
  flight_details LONGTEXT,
  show_flight_details TINYINT(1) NOT NULL DEFAULT 0,
  hotel_details LONGTEXT,
  show_hotel_details TINYINT(1) NOT NULL DEFAULT 0,
  token_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  country_id INT UNSIGNED DEFAULT NULL,
  total_seats INT DEFAULT NULL,
  seats_available INT DEFAULT NULL,
  seats_remark VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tours_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(190) DEFAULT NULL,
  is_single TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tour_media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  file VARCHAR(255) NOT NULL,
  title VARCHAR(190) DEFAULT NULL,
  alt VARCHAR(190) DEFAULT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tour_media_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
  CONSTRAINT fk_tour_media_category FOREIGN KEY (category_id) REFERENCES media_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tour_airport_prices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id INT UNSIGNED NOT NULL,
  airport_id INT UNSIGNED NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_tap (tour_id, airport_id),
  CONSTRAINT fk_tap_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
  CONSTRAINT fk_tap_airport FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verbatim from flyingdotcom/admin/tour_airports.php's own CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS tour_airport_custom_dates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id INT UNSIGNED NOT NULL,
  airport_id INT UNSIGNED NOT NULL,
  travel_date DATE NOT NULL,
  price DECIMAL(10,2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tacd (tour_id, airport_id, travel_date),
  KEY idx_tacd_tour (tour_id),
  KEY idx_tacd_air (airport_id),
  CONSTRAINT fk_tacd_tour    FOREIGN KEY (tour_id)    REFERENCES tours(id)     ON DELETE CASCADE,
  CONSTRAINT fk_tacd_airport FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tour_travel_dates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id INT UNSIGNED NOT NULL,
  travel_date DATE NOT NULL,
  label VARCHAR(190) DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  CONSTRAINT fk_ttd_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gallery_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) DEFAULT NULL,
  alt_text VARCHAR(190) DEFAULT NULL,
  file VARCHAR(255) NOT NULL,
  kind ENUM('tour','celebration') NOT NULL DEFAULT 'tour',
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verbatim from flyingdotcom/admin/cover.php's own CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS home_covers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  image VARCHAR(255) NOT NULL,
  title VARCHAR(140) DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Verbatim from flyingdotcom/admin/terms_edit.php / terms.php's own CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS settings (k VARCHAR(64) PRIMARY KEY, v LONGTEXT NOT NULL);

CREATE TABLE IF NOT EXISTS promo_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  tour_id INT UNSIGNED DEFAULT NULL,
  type ENUM('percent','amount') NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  max_discount DECIMAL(10,2) DEFAULT NULL,
  min_cart DECIMAL(10,2) NOT NULL DEFAULT 0,
  usage_limit INT DEFAULT NULL,
  per_user_limit INT DEFAULT NULL,
  starts_at DATETIME DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_promo_code (code),
  CONSTRAINT fk_promo_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
