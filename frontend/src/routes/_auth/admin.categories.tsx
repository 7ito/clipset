import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { getCategories, createCategory, updateCategory, deleteCategory, uploadCategoryImage, deleteCategoryImage } from "@/api/categories"
import type { Category } from "@/types/category"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "@/lib/toast"
import { Badge } from "@/components/ui/badge"
import { Upload, Trash2, Image as ImageIcon } from "lucide-react"

export const Route = createFileRoute("/_auth/admin/categories")({
  component: CategoriesPage
})

function CategoriesPage() {
  const queryClient = useQueryClient()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [categoryName, setCategoryName] = useState("")
  const [categoryDescription, setCategoryDescription] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // Fetch categories
  const { data, isLoading, error } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: async (newCategory) => {
      // Upload image if selected
      if (imageFile) {
        try {
          await uploadCategoryImage(newCategory.id, imageFile)
        } catch (error: any) {
          toast.error("Category created but image upload failed")
        }
      }
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setIsCreateDialogOpen(false)
      resetForm()
      toast.success("Category created successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to create category")
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name?: string; description?: string }) =>
      updateCategory(id, { name, description }),
    onSuccess: async (updatedCategory) => {
      // Upload image if new one is selected
      if (imageFile) {
        try {
          await uploadCategoryImage(updatedCategory.id, imageFile)
        } catch (error: any) {
          toast.error("Category updated but image upload failed")
        }
      }
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setIsEditDialogOpen(false)
      setSelectedCategory(null)
      resetForm()
      toast.success("Category updated successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to update category")
    },
  })
  
  // Image upload mutation
  const imageUploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      uploadCategoryImage(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      toast.success("Image uploaded successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to upload image")
    },
  })

  // Image delete mutation
  const imageDeleteMutation = useMutation({
    mutationFn: deleteCategoryImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      toast.success("Image deleted successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to delete image")
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      setIsDeleteDialogOpen(false)
      setSelectedCategory(null)
      toast.success("Category deleted successfully")
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Failed to delete category")
    },
  })

  const resetForm = () => {
    setCategoryName("")
    setCategoryDescription("")
    setImageFile(null)
    setImagePreview(null)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB")
      return
    }

    setImageFile(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setImageFile(null)
    setImagePreview(null)
  }

  const handleDeleteCategoryImage = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this image?")) return
    await imageDeleteMutation.mutateAsync(categoryId)
  }

  const handleCreate = () => {
    if (!categoryName.trim()) {
      toast.error("Category name is required")
      return
    }
    createMutation.mutate({ 
      name: categoryName.trim(),
      description: categoryDescription.trim() || undefined
    })
  }

  const handleUpdate = () => {
    if (!selectedCategory) return
    
    const updates: { name?: string; description?: string } = {}
    
    if (categoryName.trim() !== selectedCategory.name) {
      updates.name = categoryName.trim()
    }
    
    if (categoryDescription.trim() !== (selectedCategory.description || "")) {
      updates.description = categoryDescription.trim() || undefined
    }
    
    if (Object.keys(updates).length === 0 && !imageFile) {
      toast.error("No changes to save")
      return
    }
    
    updateMutation.mutate({ id: selectedCategory.id, ...updates })
  }

  const handleDelete = () => {
    if (!selectedCategory) return
    deleteMutation.mutate(selectedCategory.id)
  }

  const openEditDialog = (category: Category) => {
    setSelectedCategory(category)
    setCategoryName(category.name)
    setCategoryDescription(category.description || "")
    setImagePreview(category.image_url)
    setImageFile(null)
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (category: Category) => {
    setSelectedCategory(category)
    setIsDeleteDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading categories...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-destructive">Error loading categories</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-muted-foreground mt-1">
            Manage video categories
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          Create Category
        </Button>
      </div>

      {data?.categories && data.categories.length > 0 ? (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Videos</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    {category.image_url ? (
                      <img 
                        src={category.image_url} 
                        alt={category.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{category.slug}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{category.video_count}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(category)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteDialog(category)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-muted-foreground">No categories yet</p>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="mt-4"
            variant="outline"
          >
            Create your first category
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Category</DialogTitle>
            <DialogDescription>
              Add a new category for organizing videos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Category Name" required>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Gaming, Tutorials, Vlogs"
                maxLength={50}
              />
            </Field>
            
            <Field label="Description">
              <Textarea
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder="Brief description of this category..."
                maxLength={500}
                rows={3}
              />
            </Field>

            <Field label="Category Image">
              <div className="space-y-3">
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-32 h-32 rounded object-cover border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2"
                      onClick={handleRemoveImage}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <span className="text-xs text-muted-foreground">Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  Max 5MB. Will be resized to 400x400 square.
                </p>
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !categoryName.trim()}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update category details and image
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Category Name" required>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Gaming, Tutorials, Vlogs"
                maxLength={50}
              />
            </Field>
            
            <Field label="Description">
              <Textarea
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder="Brief description of this category..."
                maxLength={500}
                rows={3}
              />
            </Field>

            <Field label="Category Image">
              <div className="space-y-3">
                {(imagePreview || imageFile) ? (
                  <div className="relative inline-block">
                    <img 
                      src={imagePreview || ""} 
                      alt="Preview" 
                      className="w-32 h-32 rounded object-cover border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2"
                      onClick={() => {
                        if (selectedCategory?.image_url && !imageFile) {
                          // Delete existing image from server
                          handleDeleteCategoryImage(selectedCategory.id)
                          setImagePreview(null)
                        } else {
                          // Just remove preview
                          handleRemoveImage()
                        }
                      }}
                      disabled={imageDeleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <span className="text-xs text-muted-foreground">Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  Max 5MB. Will be resized to 400x400 square.
                </p>
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false)
                setSelectedCategory(null)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !categoryName.trim()}
            >
              {updateMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedCategory?.name}"?
              {selectedCategory && selectedCategory.video_count > 0 && (
                <span className="block mt-2 text-yellow-600 dark:text-yellow-500">
                  Warning: This category has {selectedCategory.video_count} video{selectedCategory.video_count !== 1 ? "s" : ""}. 
                  They will not be deleted but will have no category.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsDeleteDialogOpen(false)
                setSelectedCategory(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
