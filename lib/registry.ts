import type {
  AIService,
  ServiceCategory,
  TextService,
  VisionService,
  ImageService,
  VideoService,
  AudioService,
  EmbeddingService,
} from "./types";
import { AIServiceError } from "./errors";
import { log } from "./date";

type ServiceByCategory = {
  text: TextService;
  vision: VisionService;
  image: ImageService;
  video: VideoService;
  audio: AudioService;
  embedding: EmbeddingService;
};

export class ServiceRegistry {
  private services: Map<ServiceCategory, AIService[]> = new Map();
  private currentIndex: Map<ServiceCategory, number> = new Map();

  register<C extends ServiceCategory>(service: ServiceByCategory[C]): this {
    const category = service.category;

    if (!this.services.has(category)) {
      this.services.set(category, []);
      this.currentIndex.set(category, 0);
    }

    this.services.get(category)!.push(service);
    log(`Registrado ${service.name} para generación ${category}`);

    return this;
  }

  registerMany(services: AIService[]): this {
    for (const service of services) {
      this.register(service);
    }
    return this;
  }

  getNext<C extends ServiceCategory>(category: C): ServiceByCategory[C] {
    const categoryServices = this.services.get(category);

    if (!categoryServices || categoryServices.length === 0) {
      throw new AIServiceError(
        `No hay servicios registrados para la categoría: ${category}`,
        "registry",
        "SERVICE_ERROR",
      );
    }

    const index = this.currentIndex.get(category)!;
    const service = categoryServices[index]!;
    this.currentIndex.set(category, (index + 1) % categoryServices.length);

    return service as ServiceByCategory[C];
  }

  getAll<C extends ServiceCategory>(category: C): ServiceByCategory[C][] {
    return (this.services.get(category) || []) as ServiceByCategory[C][];
  }

  getCategories(): ServiceCategory[] {
    return Array.from(this.services.keys());
  }

  hasCategory(category: ServiceCategory): boolean {
    const services = this.services.get(category);
    return !!services && services.length > 0;
  }

  getStats(): Record<ServiceCategory, string[]> {
    const stats: Partial<Record<ServiceCategory, string[]>> = {};
    for (const [category, services] of this.services) {
      stats[category] = services.map((s) => s.name);
    }
    return stats as Record<ServiceCategory, string[]>;
  }
}

/** Global singleton registry */
export const registry = new ServiceRegistry();
