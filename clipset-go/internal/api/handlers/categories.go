package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/clipset/clipset-go/internal/api/middleware"
	"github.com/clipset/clipset-go/internal/api/response"
	"github.com/clipset/clipset-go/internal/config"
	"github.com/clipset/clipset-go/internal/db"
	"github.com/clipset/clipset-go/internal/db/sqlc"
	"github.com/clipset/clipset-go/internal/services/image"
)

// CategoriesHandler handles category management endpoints
type CategoriesHandler struct {
	db             *db.DB
	config         *config.Config
	imageProcessor *image.Processor
}

// NewCategoriesHandler creates a new categories handler
func NewCategoriesHandler(database *db.DB, cfg *config.Config, imgProcessor *image.Processor) *CategoriesHandler {
	return &CategoriesHandler{
		db:             database,
		config:         cfg,
		imageProcessor: imgProcessor,
	}
}

// Response types matching Python schemas for frontend compatibility

// CategoryResponse represents a single category
type CategoryResponse struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Slug          string    `json:"slug"`
	Description   *string   `json:"description"`
	ImageFilename *string   `json:"image_filename"`
	ImageURL      *string   `json:"image_url"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	VideoCount    int64     `json:"video_count"`
}

// CategoryListResponse represents the list categories response
type CategoryListResponse struct {
	Categories []CategoryResponse `json:"categories"`
	Total      int                `json:"total"`
}

// CategoryCreateRequest represents the create category request
type CategoryCreateRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

// CategoryUpdateRequest represents the update category request
type CategoryUpdateRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

// Helper to build category image URL
func buildCategoryImageURL(filename *string) *string {
	if filename == nil || *filename == "" {
		return nil
	}
	url := "/media/category-images/" + *filename
	return &url
}

// generateSlug generates a URL-friendly slug from a name
func generateSlug(name string) string {
	// Convert to lowercase
	slug := strings.ToLower(name)

	// Remove special characters (keep alphanumeric, spaces, hyphens)
	reg := regexp.MustCompile(`[^\w\s-]`)
	slug = reg.ReplaceAllString(slug, "")

	// Replace spaces and multiple hyphens with single hyphen
	reg = regexp.MustCompile(`[-\s]+`)
	slug = reg.ReplaceAllString(slug, "-")

	// Remove leading/trailing hyphens
	slug = strings.Trim(slug, "-")

	return slug
}

// HandleCategoryGet is a catch-all handler for GET /api/categories/{path...}
// It routes internally based on the path to handle:
//   - /api/categories/ -> List
//   - /api/categories/{category_id} -> GetByID
//   - /api/categories/slug/{slug} -> GetBySlug
//   - /api/categories/{category_id}/image -> ServeImage
func (h *CategoriesHandler) HandleCategoryGet(w http.ResponseWriter, r *http.Request) {
	path := r.PathValue("path")

	// Empty path means list all categories
	if path == "" {
		h.List(w, r)
		return
	}

	parts := strings.Split(path, "/")

	if len(parts) == 1 {
		// /api/categories/{id} or /api/categories/slug (incomplete)
		if parts[0] == "slug" {
			response.BadRequest(w, "Slug is required")
			return
		}
		// Try as UUID
		categoryID, err := uuid.Parse(parts[0])
		if err != nil {
			response.BadRequest(w, "Invalid category ID format")
			return
		}
		h.getByIDInternal(w, r, categoryID)
		return
	}

	if len(parts) == 2 {
		if parts[0] == "slug" {
			// /api/categories/slug/{slug}
			h.getBySlugInternal(w, r, parts[1])
			return
		}
		if parts[1] == "image" {
			// /api/categories/{category_id}/image
			categoryID, err := uuid.Parse(parts[0])
			if err != nil {
				response.BadRequest(w, "Invalid category ID format")
				return
			}
			h.serveImageInternal(w, r, categoryID)
			return
		}
	}

	response.NotFound(w, "Not found")
}

// HandleCategoryPost is a catch-all handler for POST /api/categories/{path...}
// It routes internally based on the path to handle:
//   - /api/categories/ -> Create
//   - /api/categories/{category_id}/image -> UploadImage
func (h *CategoriesHandler) HandleCategoryPost(w http.ResponseWriter, r *http.Request) {
	path := r.PathValue("path")

	// Empty path means create category
	if path == "" {
		h.Create(w, r)
		return
	}

	parts := strings.Split(path, "/")

	if len(parts) == 2 && parts[1] == "image" {
		// /api/categories/{category_id}/image
		categoryID, err := uuid.Parse(parts[0])
		if err != nil {
			response.BadRequest(w, "Invalid category ID format")
			return
		}
		h.uploadImageInternal(w, r, categoryID)
		return
	}

	response.NotFound(w, "Not found")
}

// HandleCategoryDelete is a catch-all handler for DELETE /api/categories/{path...}
// It routes internally based on the path to handle:
//   - /api/categories/{category_id} -> Delete
//   - /api/categories/{category_id}/image -> DeleteImage
func (h *CategoriesHandler) HandleCategoryDelete(w http.ResponseWriter, r *http.Request) {
	path := r.PathValue("path")
	parts := strings.Split(path, "/")

	if len(parts) == 1 {
		// /api/categories/{category_id}
		categoryID, err := uuid.Parse(parts[0])
		if err != nil {
			response.BadRequest(w, "Invalid category ID format")
			return
		}
		h.deleteInternal(w, r, categoryID)
		return
	}

	if len(parts) == 2 && parts[1] == "image" {
		// /api/categories/{category_id}/image
		categoryID, err := uuid.Parse(parts[0])
		if err != nil {
			response.BadRequest(w, "Invalid category ID format")
			return
		}
		h.deleteImageInternal(w, r, categoryID)
		return
	}

	response.NotFound(w, "Not found")
}

// List handles GET /api/categories/
func (h *CategoriesHandler) List(w http.ResponseWriter, r *http.Request) {
	categories, err := h.db.Queries.ListCategories(r.Context())
	if err != nil {
		log.Printf("Error listing categories: %v", err)
		response.InternalServerError(w, "Failed to list categories")
		return
	}

	result := make([]CategoryResponse, len(categories))
	for i, c := range categories {
		result[i] = CategoryResponse{
			ID:            c.ID.String(),
			Name:          c.Name,
			Slug:          c.Slug,
			Description:   c.Description,
			ImageFilename: c.ImageFilename,
			ImageURL:      buildCategoryImageURL(c.ImageFilename),
			CreatedBy:     c.CreatedBy.String(),
			CreatedAt:     c.CreatedAt,
			UpdatedAt:     c.UpdatedAt,
			VideoCount:    c.VideoCount,
		}
	}

	response.OK(w, CategoryListResponse{
		Categories: result,
		Total:      len(result),
	})
}

// Create handles POST /api/categories/
func (h *CategoriesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CategoryCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	// Validate name
	name := strings.TrimSpace(req.Name)
	if name == "" {
		response.BadRequest(w, "Name is required")
		return
	}
	if len(name) > 50 {
		response.BadRequest(w, "Name must be 50 characters or less")
		return
	}

	// Validate description
	if req.Description != nil && len(*req.Description) > 500 {
		response.BadRequest(w, "Description must be 500 characters or less")
		return
	}

	ctx := r.Context()

	// Check if name already exists (case-insensitive)
	exists, err := h.db.Queries.CategoryExistsByName(ctx, name)
	if err != nil {
		log.Printf("Error checking category name: %v", err)
		response.InternalServerError(w, "Failed to create category")
		return
	}
	if exists {
		response.BadRequest(w, "A category with this name already exists")
		return
	}

	// Get current user ID
	userID, ok := middleware.GetUserID(ctx)
	if !ok {
		response.Unauthorized(w, "Not authenticated")
		return
	}

	// Generate slug
	slug := generateSlug(name)

	// Create category
	category, err := h.db.Queries.CreateCategory(ctx, sqlc.CreateCategoryParams{
		Name:        name,
		Slug:        slug,
		Description: req.Description,
		CreatedBy:   userID,
	})
	if err != nil {
		log.Printf("Error creating category: %v", err)
		response.InternalServerError(w, "Failed to create category")
		return
	}

	response.Created(w, CategoryResponse{
		ID:            category.ID.String(),
		Name:          category.Name,
		Slug:          category.Slug,
		Description:   category.Description,
		ImageFilename: category.ImageFilename,
		ImageURL:      buildCategoryImageURL(category.ImageFilename),
		CreatedBy:     category.CreatedBy.String(),
		CreatedAt:     category.CreatedAt,
		UpdatedAt:     category.UpdatedAt,
		VideoCount:    0,
	})
}

// GetByIDOrSlug handles GET /api/categories/{category_id_or_slug}
// This is a combined handler that routes to GetByID or GetBySlug based on the path
// It handles routes like:
//   - /api/categories/{uuid} -> GetByID
//   - /api/categories/slug/{slug} -> GetBySlug
func (h *CategoriesHandler) GetByIDOrSlug(w http.ResponseWriter, r *http.Request) {
	param := r.PathValue("category_id_or_slug")
	if param == "" {
		response.BadRequest(w, "Category ID or slug is required")
		return
	}

	// Check if this is the "slug" path prefix
	if param == "slug" {
		// Get the actual slug from the remaining path
		slug := r.PathValue("slug")
		if slug == "" {
			response.BadRequest(w, "Slug is required")
			return
		}
		h.getBySlugInternal(w, r, slug)
		return
	}

	// Try to parse as UUID first
	categoryID, err := uuid.Parse(param)
	if err != nil {
		// Not a valid UUID - might be a direct slug lookup (shouldn't happen with current API)
		response.BadRequest(w, "Invalid category ID format")
		return
	}

	h.getByIDInternal(w, r, categoryID)
}

// getByIDInternal fetches category by UUID
func (h *CategoriesHandler) getByIDInternal(w http.ResponseWriter, r *http.Request, categoryID uuid.UUID) {
	category, err := h.db.Queries.GetCategoryByIDWithCount(r.Context(), categoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Category not found")
			return
		}
		log.Printf("Error getting category: %v", err)
		response.InternalServerError(w, "Failed to get category")
		return
	}

	response.OK(w, CategoryResponse{
		ID:            category.ID.String(),
		Name:          category.Name,
		Slug:          category.Slug,
		Description:   category.Description,
		ImageFilename: category.ImageFilename,
		ImageURL:      buildCategoryImageURL(category.ImageFilename),
		CreatedBy:     category.CreatedBy.String(),
		CreatedAt:     category.CreatedAt,
		UpdatedAt:     category.UpdatedAt,
		VideoCount:    category.VideoCount,
	})
}

// GetByID handles GET /api/categories/{category_id}
func (h *CategoriesHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	categoryIDStr := r.PathValue("category_id")
	if categoryIDStr == "" {
		response.BadRequest(w, "Category ID is required")
		return
	}

	categoryID, err := uuid.Parse(categoryIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid category ID format")
		return
	}

	h.getByIDInternal(w, r, categoryID)
}

// getBySlugInternal fetches category by slug
func (h *CategoriesHandler) getBySlugInternal(w http.ResponseWriter, r *http.Request, slug string) {
	category, err := h.db.Queries.GetCategoryBySlugWithCount(r.Context(), slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Category not found")
			return
		}
		log.Printf("Error getting category by slug: %v", err)
		response.InternalServerError(w, "Failed to get category")
		return
	}

	response.OK(w, CategoryResponse{
		ID:            category.ID.String(),
		Name:          category.Name,
		Slug:          category.Slug,
		Description:   category.Description,
		ImageFilename: category.ImageFilename,
		ImageURL:      buildCategoryImageURL(category.ImageFilename),
		CreatedBy:     category.CreatedBy.String(),
		CreatedAt:     category.CreatedAt,
		UpdatedAt:     category.UpdatedAt,
		VideoCount:    category.VideoCount,
	})
}

// GetBySlug handles GET /api/categories/slug/{slug}
func (h *CategoriesHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if slug == "" {
		response.BadRequest(w, "Slug is required")
		return
	}

	h.getBySlugInternal(w, r, slug)
}

// Update handles PATCH /api/categories/{category_id}
func (h *CategoriesHandler) Update(w http.ResponseWriter, r *http.Request) {
	categoryIDStr := r.PathValue("category_id")
	if categoryIDStr == "" {
		response.BadRequest(w, "Category ID is required")
		return
	}

	categoryID, err := uuid.Parse(categoryIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid category ID format")
		return
	}

	var req CategoryUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.BadRequest(w, "Invalid request body")
		return
	}

	ctx := r.Context()

	// Check category exists
	existingCategory, err := h.db.Queries.GetCategoryByID(ctx, categoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Category not found")
			return
		}
		log.Printf("Error getting category: %v", err)
		response.InternalServerError(w, "Failed to update category")
		return
	}

	// Prepare update values
	name := ""
	slug := ""

	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			response.BadRequest(w, "Name cannot be empty")
			return
		}
		if len(name) > 50 {
			response.BadRequest(w, "Name must be 50 characters or less")
			return
		}

		// Check if name already exists for another category (case-insensitive)
		exists, err := h.db.Queries.CategoryExistsByNameExcludingID(ctx, sqlc.CategoryExistsByNameExcludingIDParams{
			Lower: name,
			ID:    categoryID,
		})
		if err != nil {
			log.Printf("Error checking category name: %v", err)
			response.InternalServerError(w, "Failed to update category")
			return
		}
		if exists {
			response.BadRequest(w, "A category with this name already exists")
			return
		}

		// Generate new slug
		slug = generateSlug(name)
	}

	// Validate description
	if req.Description != nil && len(*req.Description) > 500 {
		response.BadRequest(w, "Description must be 500 characters or less")
		return
	}

	// Determine description to use
	description := existingCategory.Description
	if req.Description != nil {
		description = req.Description
	}

	// Update category
	category, err := h.db.Queries.UpdateCategory(ctx, sqlc.UpdateCategoryParams{
		ID:          categoryID,
		Column2:     name, // name (empty string means keep existing)
		Column3:     slug, // slug (empty string means keep existing)
		Description: description,
	})
	if err != nil {
		log.Printf("Error updating category: %v", err)
		response.InternalServerError(w, "Failed to update category")
		return
	}

	// Get video count for response
	categoryWithCount, err := h.db.Queries.GetCategoryByIDWithCount(ctx, categoryID)
	videoCount := int64(0)
	if err == nil {
		videoCount = categoryWithCount.VideoCount
	}

	response.OK(w, CategoryResponse{
		ID:            category.ID.String(),
		Name:          category.Name,
		Slug:          category.Slug,
		Description:   category.Description,
		ImageFilename: category.ImageFilename,
		ImageURL:      buildCategoryImageURL(category.ImageFilename),
		CreatedBy:     category.CreatedBy.String(),
		CreatedAt:     category.CreatedAt,
		UpdatedAt:     category.UpdatedAt,
		VideoCount:    videoCount,
	})
}

// deleteInternal handles the actual delete logic
func (h *CategoriesHandler) deleteInternal(w http.ResponseWriter, r *http.Request, categoryID uuid.UUID) {
	ctx := r.Context()

	// Get category to check if it exists and get image filename
	category, err := h.db.Queries.GetCategoryByID(ctx, categoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Category not found")
			return
		}
		log.Printf("Error getting category: %v", err)
		response.InternalServerError(w, "Failed to delete category")
		return
	}

	// Delete category image if exists
	if category.ImageFilename != nil {
		if err := h.imageProcessor.DeleteCategoryImage(*category.ImageFilename); err != nil {
			log.Printf("Warning: failed to delete category image: %v", err)
		}
	}

	// Delete category
	if err := h.db.Queries.DeleteCategory(ctx, categoryID); err != nil {
		log.Printf("Error deleting category: %v", err)
		response.InternalServerError(w, "Failed to delete category")
		return
	}

	response.NoContent(w)
}

// Delete handles DELETE /api/categories/{category_id}
func (h *CategoriesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	categoryIDStr := r.PathValue("category_id")
	if categoryIDStr == "" {
		response.BadRequest(w, "Category ID is required")
		return
	}

	categoryID, err := uuid.Parse(categoryIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid category ID format")
		return
	}

	h.deleteInternal(w, r, categoryID)
}

// uploadImageInternal handles the actual upload image logic
func (h *CategoriesHandler) uploadImageInternal(w http.ResponseWriter, r *http.Request, categoryID uuid.UUID) {
	ctx := r.Context()

	// Check category exists
	category, err := h.db.Queries.GetCategoryByID(ctx, categoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Category not found")
			return
		}
		log.Printf("Error getting category: %v", err)
		response.InternalServerError(w, "Failed to upload image")
		return
	}

	// Parse multipart form (max 10MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		response.BadRequest(w, "Failed to parse form data")
		return
	}

	// Get file from form
	file, header, err := r.FormFile("file")
	if err != nil {
		response.BadRequest(w, "No file provided")
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		response.BadRequest(w, "File must be an image")
		return
	}

	// Save uploaded file to temp
	tempPath, err := h.imageProcessor.SaveUploadToTemp(file, header.Filename)
	if err != nil {
		log.Printf("Error saving temp file: %v", err)
		response.InternalServerError(w, "Failed to save uploaded file")
		return
	}
	defer h.imageProcessor.DeleteFile(tempPath) // Clean up temp file

	// Validate image
	if err := h.imageProcessor.ValidateCategoryImage(tempPath); err != nil {
		response.BadRequest(w, err.Error())
		return
	}

	// Delete old image if exists
	if category.ImageFilename != nil {
		if err := h.imageProcessor.DeleteCategoryImage(*category.ImageFilename); err != nil {
			log.Printf("Warning: failed to delete old category image: %v", err)
		}
	}

	// Process image
	filename, err := h.imageProcessor.ProcessCategoryImage(tempPath, categoryID.String())
	if err != nil {
		log.Printf("Error processing category image: %v", err)
		response.InternalServerError(w, "Failed to process image")
		return
	}

	// Update category record
	updatedCategory, err := h.db.Queries.UpdateCategoryImage(ctx, sqlc.UpdateCategoryImageParams{
		ID:            categoryID,
		ImageFilename: &filename,
	})
	if err != nil {
		log.Printf("Error updating category image: %v", err)
		// Try to clean up the new image file
		h.imageProcessor.DeleteCategoryImage(filename)
		response.InternalServerError(w, "Failed to update category image")
		return
	}

	// Get video count for response
	categoryWithCount, err := h.db.Queries.GetCategoryByIDWithCount(ctx, categoryID)
	videoCount := int64(0)
	if err == nil {
		videoCount = categoryWithCount.VideoCount
	}

	response.OK(w, CategoryResponse{
		ID:            updatedCategory.ID.String(),
		Name:          updatedCategory.Name,
		Slug:          updatedCategory.Slug,
		Description:   updatedCategory.Description,
		ImageFilename: updatedCategory.ImageFilename,
		ImageURL:      buildCategoryImageURL(updatedCategory.ImageFilename),
		CreatedBy:     updatedCategory.CreatedBy.String(),
		CreatedAt:     updatedCategory.CreatedAt,
		UpdatedAt:     updatedCategory.UpdatedAt,
		VideoCount:    videoCount,
	})
}

// UploadImage handles POST /api/categories/{category_id}/image
func (h *CategoriesHandler) UploadImage(w http.ResponseWriter, r *http.Request) {
	categoryIDStr := r.PathValue("category_id")
	if categoryIDStr == "" {
		response.BadRequest(w, "Category ID is required")
		return
	}

	categoryID, err := uuid.Parse(categoryIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid category ID format")
		return
	}

	h.uploadImageInternal(w, r, categoryID)
}

// serveImageInternal handles the actual image serving logic
func (h *CategoriesHandler) serveImageInternal(w http.ResponseWriter, r *http.Request, categoryID uuid.UUID) {
	// Get category
	category, err := h.db.Queries.GetCategoryByID(r.Context(), categoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Category not found")
			return
		}
		log.Printf("Error getting category: %v", err)
		response.InternalServerError(w, "Failed to get category")
		return
	}

	// Check if category has an image
	if category.ImageFilename == nil || *category.ImageFilename == "" {
		response.NotFound(w, "Category has no image")
		return
	}

	// Get image file path
	imagePath := h.imageProcessor.GetCategoryImagePath(*category.ImageFilename)

	// Check if file exists
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		response.NotFound(w, "Image file not found")
		return
	}

	// Set cache headers (1 year)
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Header().Set("Content-Type", "image/jpeg")

	// Serve the file
	http.ServeFile(w, r, imagePath)
}

// ServeImage handles GET /api/categories/{category_id}/image
func (h *CategoriesHandler) ServeImage(w http.ResponseWriter, r *http.Request) {
	categoryIDStr := r.PathValue("category_id")
	if categoryIDStr == "" {
		response.BadRequest(w, "Category ID is required")
		return
	}

	categoryID, err := uuid.Parse(categoryIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid category ID format")
		return
	}

	h.serveImageInternal(w, r, categoryID)
}

// deleteImageInternal handles the actual delete image logic
func (h *CategoriesHandler) deleteImageInternal(w http.ResponseWriter, r *http.Request, categoryID uuid.UUID) {
	ctx := r.Context()

	// Get category
	category, err := h.db.Queries.GetCategoryByID(ctx, categoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Category not found")
			return
		}
		log.Printf("Error getting category: %v", err)
		response.InternalServerError(w, "Failed to delete image")
		return
	}

	// Check if category has an image
	if category.ImageFilename == nil || *category.ImageFilename == "" {
		response.NotFound(w, "Category has no image")
		return
	}

	// Delete image file
	if err := h.imageProcessor.DeleteCategoryImage(*category.ImageFilename); err != nil {
		log.Printf("Warning: failed to delete category image file: %v", err)
	}

	// Update category record
	if _, err := h.db.Queries.DeleteCategoryImage(ctx, categoryID); err != nil {
		log.Printf("Error deleting category image record: %v", err)
		response.InternalServerError(w, "Failed to delete image")
		return
	}

	response.NoContent(w)
}

// DeleteImage handles DELETE /api/categories/{category_id}/image
func (h *CategoriesHandler) DeleteImage(w http.ResponseWriter, r *http.Request) {
	categoryIDStr := r.PathValue("category_id")
	if categoryIDStr == "" {
		response.BadRequest(w, "Category ID is required")
		return
	}

	categoryID, err := uuid.Parse(categoryIDStr)
	if err != nil {
		response.BadRequest(w, "Invalid category ID format")
		return
	}

	h.deleteImageInternal(w, r, categoryID)
}
