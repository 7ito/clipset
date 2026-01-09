-- name: GetCategoryByID :one
SELECT * FROM categories WHERE id = $1;

-- name: GetCategoryBySlug :one
SELECT * FROM categories WHERE slug = $1;

-- name: CreateCategory :one
INSERT INTO categories (
    name, slug, description, created_by
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: UpdateCategory :one
UPDATE categories SET
    name = COALESCE(NULLIF($2, ''), name),
    slug = COALESCE(NULLIF($3, ''), slug),
    description = $4,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: UpdateCategoryImage :one
UPDATE categories SET
    image_filename = $2,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteCategoryImage :one
UPDATE categories SET
    image_filename = NULL,
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteCategory :exec
DELETE FROM categories WHERE id = $1;

-- name: ListCategories :many
SELECT 
    c.*,
    COUNT(v.id) as video_count
FROM categories c
LEFT JOIN videos v ON v.category_id = c.id AND v.processing_status = 'completed'
GROUP BY c.id
ORDER BY c.name ASC;

-- name: CategoryExistsByName :one
SELECT EXISTS(SELECT 1 FROM categories WHERE LOWER(name) = LOWER($1));

-- name: CategoryExistsBySlug :one
SELECT EXISTS(SELECT 1 FROM categories WHERE slug = $1);

-- name: GetCategoryByIDWithCount :one
SELECT 
    c.*,
    COUNT(v.id) as video_count
FROM categories c
LEFT JOIN videos v ON v.category_id = c.id AND v.processing_status = 'completed'
WHERE c.id = $1
GROUP BY c.id;

-- name: GetCategoryBySlugWithCount :one
SELECT 
    c.*,
    COUNT(v.id) as video_count
FROM categories c
LEFT JOIN videos v ON v.category_id = c.id AND v.processing_status = 'completed'
WHERE c.slug = $1
GROUP BY c.id;

-- name: CategoryExistsByNameExcludingID :one
SELECT EXISTS(SELECT 1 FROM categories WHERE LOWER(name) = LOWER($1) AND id != $2);
