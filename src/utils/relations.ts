import { Item, ItemType } from '../types';

/**
 * Bağ türleri — sabit liste (yapisal-4, 28: "sahibi, çalışır, akrabası…").
 * Madde düzenleyicide bağ bu listeden seçilir; yeni tür elle eklenmez.
 */
export const BAG_TURLERI = [
  { id: 'bulunduğu yer', ad: 'Bulunduğu yer' },
  { id: 'sahibi', ad: 'Sahibi' },
  { id: 'çalışanı', ad: 'Çalışır' },
  { id: 'üyesi', ad: 'Üyesi' },
  { id: 'akrabası', ad: 'Akrabası' },
  // Soy ağacı (6. gece, Kemal): aile, iş, arkadaşlık ve rekabet.
  // "A → ebeveyni → B": B, A'nın ebeveynidir (tersi: B'nin çocuğu A).
  { id: 'ebeveyni', ad: 'Ebeveyni' },
  { id: 'eşi', ad: 'Eşi' },
  { id: 'kardeşi', ad: 'Kardeşi' },
  { id: 'patronu', ad: 'Patronu' },
  { id: 'iş ortağı', ad: 'İş ortağı' },
  { id: 'arkadaşı', ad: 'Arkadaşı' },
  { id: 'rakibi', ad: 'Rakibi' },
  { id: 'ait olduğu marka', ad: 'Ait olduğu kurum' },
  { id: 'ilgili olay', ad: 'İlgili olay' },
  { id: 'tanıdığı kişi', ad: 'Tanıdığı' },
  { id: 'genel bağlantı', ad: 'Genel bağ' }
] as const;
export type BagTuru = typeof BAG_TURLERI[number]['id'];

export interface Relation {
  targetId: string;
  type: BagTuru;
  /** Bağın geçerli olduğu yıllar (6. gece, soy ağacının dönem sürümleri); bitişi yoksa açık uçlu */
  bas?: number;
  bit?: number;
  isProposal?: boolean;
  reason?: string;
}

export interface BidirectionalRelation {
  id: string; // Unique combination of item IDs
  sourceId: string;
  targetId: string;
  sourceTitle: string;
  targetTitle: string;
  sourceType: ItemType;
  targetType: ItemType;
  type: BagTuru;
  isProposal: boolean;
  reason?: string;
  originItemId: string; // Which item actually stores this relation record
}

// Check if an item has any accepted links/connections (implicit or explicit)
export function isEntityUnlinked(item: Item, allItems: Item[]): boolean {
  // Aile bağı (yapisal-4): kişinin künyesindeki "Aile" alanı da bağ sayılır
  const aileAdi = (x: Item) => String((x.metadata?.profile as Record<string, unknown> | undefined)?.aile || '').trim().toLocaleLowerCase('tr');
  if ((item.type === 'kisi' || item.type === 'karakter') && aileAdi(item)) return false;
  if (item.type === 'aile' && allItems.some(x => !x.archived && aileAdi(x) === item.title.trim().toLocaleLowerCase('tr'))) return false;

  if (item.archived || item.isProposal) return false;

  // 1. Explicit metadata.relations
  const hasRelations = (item.metadata?.relations || []).some((r: any) => !r.isProposal);
  if (hasRelations) return false;

  // 2. Metadata brandId or placeId
  if (item.metadata?.brandId || item.metadata?.placeId) return false;

  // 3. Links array
  if (item.links && item.links.length > 0) return false;

  // 4. Check if any other item links to this item
  const isLinkedByOthers = allItems.some(other => {
    if (other.id === item.id || other.archived || other.isProposal) return false;

    // Brand / Place parent reference
    if (other.metadata?.brandId === item.id || other.metadata?.placeId === item.id) return true;

    // Explicit relation
    const otherRelations = other.metadata?.relations || [];
    if (otherRelations.some((r: any) => r.targetId === item.id && !r.isProposal)) return true;

    // Legacy links
    if (other.links && other.links.includes(item.id)) return true;

    return false;
  });

  return !isLinkedByOthers;
}

// Helper to determine the inverse label for a relationship type
export function getRelationLabels(
  type: string,
  _sourceType: ItemType,
  _targetType: ItemType
): { forward: string; inverse: string } {
  switch (type) {
    case 'bulunduğu yer':
      return {
        forward: 'Bulunduğu Yer / Konum',
        inverse: 'Buradaki Kişiler / Varlıklar'
      };
    case 'sahibi':
      return {
        forward: 'Sahibi / İşletmecisi',
        inverse: 'Sahip Olduğu Varlıklar'
      };
    case 'çalışanı':
      return {
        forward: 'Çalışanı',
        inverse: 'Çalışanları / Ekibi'
      };
    case 'üyesi':
      return {
        forward: 'Üyesi Olduğu Topluluk',
        inverse: 'Üyeleri / Katılımcıları'
      };
    case 'ait olduğu marka':
      return {
        forward: 'Ait Olduğu Marka / Çatı',
        inverse: 'Markaya Bağlı Alt Varlıklar'
      };
    case 'ilgili olay':
      return {
        forward: 'İlgili Olay / Vakıa',
        inverse: 'Olayla İlişkili Kişiler / Yerler'
      };
    case 'akrabası':
      return {
        forward: 'Akrabaları',
        inverse: 'Akrabaları'
      };
    case 'ebeveyni':
      return { forward: 'Ebeveyni', inverse: 'Çocukları' };
    case 'eşi':
      return { forward: 'Eşi', inverse: 'Eşi' };
    case 'kardeşi':
      return { forward: 'Kardeşleri', inverse: 'Kardeşleri' };
    case 'patronu':
      return { forward: 'Patronu', inverse: 'Yanında çalışanlar' };
    case 'iş ortağı':
      return { forward: 'İş ortakları', inverse: 'İş ortakları' };
    case 'arkadaşı':
      return { forward: 'Arkadaşları', inverse: 'Arkadaşları' };
    case 'rakibi':
      return { forward: 'Rakipleri', inverse: 'Rakipleri' };
    case 'tanıdığı kişi':
      return {
        forward: 'Tanıdığı Kişi / Bağlantı',
        inverse: 'Tanıdığı Kişi / Bağlantı'
      };
    default:
      return {
        forward: 'Bağlantılı Varlık',
        inverse: 'Bağlantılı Varlık'
      };
  }
}

// Resolve all bidirectional relationships for a given item, deduplicating them
export function resolveAllRelations(item: Item, tumu: Item[]): BidirectionalRelation[] {
  // Öneri tepsisindeki kayıtlar (aday) madde değildir; bağlantı sayılmaz
  const allItems = tumu.filter(i => i.type !== 'aday');
  const relationsMap = new Map<string, BidirectionalRelation>();

  const addRelation = (rel: Omit<BidirectionalRelation, 'id'>) => {
    const key = [rel.sourceId, rel.targetId, rel.type].sort().join('::');
    if (!relationsMap.has(key)) {
      relationsMap.set(key, { ...rel, id: key });
    } else {
      // If one is official and another is proposed, prefer the official one
      const existing = relationsMap.get(key)!;
      if (existing.isProposal && !rel.isProposal) {
        relationsMap.set(key, { ...rel, id: key });
      }
    }
  };

  const itemMap = new Map<string, Item>(allItems.map(i => [i.id, i]));

  // --- 1. Process explicit relations inside metadata.relations ---
  const directRelations = item.metadata?.relations || [];
  directRelations.forEach((r: any) => {
    const target = itemMap.get(r.targetId);
    if (target && !target.archived) {
      addRelation({
        sourceId: item.id,
        targetId: target.id,
        sourceTitle: item.title,
        targetTitle: target.title,
        sourceType: item.type,
        targetType: target.type,
        type: r.type,
        isProposal: !!r.isProposal,
        reason: r.reason,
        originItemId: item.id
      });
    }
  });

  // --- 2. Process incoming explicit relations from other items ---
  allItems.forEach(other => {
    if (other.id === item.id || other.archived) return;
    const otherRelations = other.metadata?.relations || [];
    otherRelations.forEach((r: any) => {
      if (r.targetId === item.id) {
        addRelation({
          sourceId: other.id,
          targetId: item.id,
          sourceTitle: other.title,
          targetTitle: item.title,
          sourceType: other.type,
          targetType: item.type,
          type: r.type,
          isProposal: !!r.isProposal,
          reason: r.reason,
          originItemId: other.id
        });
      }
    });
  });

  // --- 3. Process implicit placeId metadata reference ---
  if (item.metadata?.placeId) {
    const target = itemMap.get(item.metadata.placeId);
    if (target && !target.archived) {
      addRelation({
        sourceId: item.id,
        targetId: target.id,
        sourceTitle: item.title,
        targetTitle: target.title,
        sourceType: item.type,
        targetType: target.type,
        type: 'bulunduğu yer',
        isProposal: false,
        originItemId: item.id
      });
    }
  }

  // Incoming placeId references
  allItems.forEach(other => {
    if (other.id === item.id || other.archived) return;
    if (other.metadata?.placeId === item.id) {
      addRelation({
        sourceId: other.id,
        targetId: item.id,
        sourceTitle: other.title,
        targetTitle: item.title,
        sourceType: other.type,
        targetType: item.type,
        type: 'bulunduğu yer',
        isProposal: false,
        originItemId: other.id
      });
    }
  });

  // --- 4. Process implicit brandId metadata reference ---
  if (item.metadata?.brandId) {
    const target = itemMap.get(item.metadata.brandId);
    if (target && !target.archived) {
      addRelation({
        sourceId: item.id,
        targetId: target.id,
        sourceTitle: item.title,
        targetTitle: target.title,
        sourceType: item.type,
        targetType: target.type,
        type: 'ait olduğu marka',
        isProposal: false,
        originItemId: item.id
      });
    }
  }

  // Incoming brandId references
  allItems.forEach(other => {
    if (other.id === item.id || other.archived) return;
    if (other.metadata?.brandId === item.id) {
      addRelation({
        sourceId: other.id,
        targetId: item.id,
        sourceTitle: other.title,
        targetTitle: item.title,
        sourceType: other.type,
        targetType: item.type,
        type: 'ait olduğu marka',
        isProposal: false,
        originItemId: other.id
      });
    }
  });

  // --- 5. Process legacy links array ---
  const itemLinks = item.links || [];
  itemLinks.forEach(targetId => {
    const target = itemMap.get(targetId);
    if (target && !target.archived) {
      addRelation({
        sourceId: item.id,
        targetId: target.id,
        sourceTitle: item.title,
        targetTitle: target.title,
        sourceType: item.type,
        targetType: target.type,
        type: 'genel bağlantı',
        isProposal: false,
        originItemId: item.id
      });
    }
  });

  // Incoming legacy links
  allItems.forEach(other => {
    if (other.id === item.id || other.archived) return;
    const otherLinks = other.links || [];
    if (otherLinks.includes(item.id)) {
      addRelation({
        sourceId: other.id,
        targetId: item.id,
        sourceTitle: other.title,
        targetTitle: item.title,
        sourceType: other.type,
        targetType: item.type,
        type: 'genel bağlantı',
        isProposal: false,
        originItemId: other.id
      });
    }
  });

  return Array.from(relationsMap.values());
}

// Clean up references to a deleted item across all other items' relations and legacy links
export async function cleanupRelationsOnDelete(
  deletedId: string,
  allItems: Item[],
  onUpdateItem: (item: Item) => Promise<void>
): Promise<void> {
  const updates: Promise<void>[] = [];

  allItems.forEach(item => {
    if (item.id === deletedId) return;

    let changed = false;
    const updatedMetadata = { ...(item.metadata || {}) };

    // 1. Clean from relations array
    if (updatedMetadata.relations && Array.isArray(updatedMetadata.relations)) {
      const originalLength = updatedMetadata.relations.length;
      updatedMetadata.relations = updatedMetadata.relations.filter((r: any) => r.targetId !== deletedId);
      if (updatedMetadata.relations.length !== originalLength) {
        changed = true;
      }
    }

    // 2. Clean from placeId or brandId parent pointers
    if (updatedMetadata.placeId === deletedId) {
      delete updatedMetadata.placeId;
      changed = true;
    }
    if (updatedMetadata.brandId === deletedId) {
      delete updatedMetadata.brandId;
      changed = true;
    }

    // 3. Clean from legacy links array
    let updatedLinks = [...(item.links || [])];
    if (updatedLinks.includes(deletedId)) {
      updatedLinks = updatedLinks.filter(id => id !== deletedId);
      changed = true;
    }

    if (changed) {
      updates.push(
        onUpdateItem({
          ...item,
          links: updatedLinks,
          metadata: updatedMetadata
        })
      );
    }
  });

  await Promise.all(updates);
}

