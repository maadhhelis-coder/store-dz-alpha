import * as categoriesRepository from "@/server/repositories/categoriesRepository";
import type { CategoryCreateInput, CategoryUpdateInput } from "@/lib/validation/categorySchema";

export class CategoryNotFoundError extends Error {
  constructor() {
    super("التصنيف غير موجود");
    this.name = "CategoryNotFoundError";
  }
}

export class DuplicateCategorySlugError extends Error {
  constructor() {
    super("يوجد تصنيف آخر بنفس الرابط");
    this.name = "DuplicateCategorySlugError";
  }
}

export class CategoryInUseError extends Error {
  constructor(productCount: number) {
    super(`لا يمكن حذف هذا التصنيف لأنه مرتبط بـ ${productCount} منتج. غيّر تصنيف هذه المنتجات أولاً.`);
    this.name = "CategoryInUseError";
  }
}

export function listCategories() {
  return categoriesRepository.listCategories();
}

export async function getCategory(id: string) {
  const category = await categoriesRepository.findCategoryById(id);
  if (!category) throw new CategoryNotFoundError();
  return category;
}

export async function createCategory(input: CategoryCreateInput) {
  const existing = await categoriesRepository.findCategoryBySlug(input.slug);
  if (existing) throw new DuplicateCategorySlugError();
  return categoriesRepository.createCategory(input);
}

export async function updateCategory(id: string, input: CategoryUpdateInput) {
  const existing = await categoriesRepository.findCategoryById(id);
  if (!existing) throw new CategoryNotFoundError();

  if (input.slug && input.slug !== existing.slug) {
    const bySlug = await categoriesRepository.findCategoryBySlug(input.slug);
    if (bySlug) throw new DuplicateCategorySlugError();
  }

  return categoriesRepository.updateCategory(id, input);
}

export async function deleteCategory(id: string) {
  const existing = await categoriesRepository.findCategoryById(id);
  if (!existing) throw new CategoryNotFoundError();

  const productCount = await categoriesRepository.countProductsInCategory(id);
  if (productCount > 0) throw new CategoryInUseError(productCount);

  return categoriesRepository.deleteCategory(id);
}
