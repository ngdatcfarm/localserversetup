-- ML Dataset tables for chick detection training

CREATE TABLE IF NOT EXISTS ml_dataset_images (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    filepath VARCHAR(500) NOT NULL,
    original_width INTEGER,
    original_height INTEGER,
    label_status VARCHAR(50) DEFAULT 'unlabeled',  -- unlabeled, labeled, verified
    class_name VARCHAR(50) DEFAULT 'chick',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ml_dataset_labels (
    id SERIAL PRIMARY KEY,
    image_id INTEGER REFERENCES ml_dataset_images(id) ON DELETE CASCADE,
    class_name VARCHAR(50) DEFAULT 'chick',
    x_center FLOAT NOT NULL,      -- 0.0 to 1.0 relative to image width
    y_center FLOAT NOT NULL,      -- 0.0 to 1.0 relative to image height
    width FLOAT NOT NULL,          -- relative to image width
    height FLOAT NOT NULL,         -- relative to image height
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dataset_images_status ON ml_dataset_images(label_status);
CREATE INDEX IF NOT EXISTS idx_dataset_labels_image ON ml_dataset_labels(image_id);
