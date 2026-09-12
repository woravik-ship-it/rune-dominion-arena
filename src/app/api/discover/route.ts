import { NextRequest, NextResponse } from 'next/server';
import { buildCanonicalString, hashSeed, createCardFromSeed, validateRuneSequence } from '@/services/seed';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { runes, userId } = body;

    // Validate rune sequence
    const validation = validateRuneSequence(runes);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Build canonical string
    const canonicalString = buildCanonicalString(runes);

    // Hash seed
    const seedHash = hashSeed(canonicalString);

    // Create card from seed (deterministic)
    const card = createCardFromSeed(seedHash);

    // TODO: Check if card exists in database
    // TODO: Check user energy
    // TODO: Deduct energy
    // TODO: Save discovery log
    // TODO: Return card with discovery status

    return NextResponse.json({
      success: true,
      card: {
        name: card.name,
        nameTh: card.nameTh,
        description: card.description,
        descriptionTh: card.descriptionTh,
        lore: card.lore,
        loreTh: card.loreTh,
        element: card.element,
        rarity: card.rarity,
        role: card.role,
        stats: {
          atk: card.atk,
          def: card.def,
          hp: card.hp,
          spd: card.spd,
          manaCost: card.manaCost,
        },
        skills: card.skills,
        imageUrl: null,
        imageStatus: 'PENDING',
      },
      discovery: {
        isFirstDiscovery: true,
        seedHash,
        canonicalString,
      },
    });
  } catch (error) {
    console.error('Discovery error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
