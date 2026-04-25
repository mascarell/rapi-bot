import { describe, it, expect } from 'vitest';
import { preprocessMessage } from '../messagePreprocessor';

describe('messagePreprocessor', () => {
    describe('default options (CCP-checker behavior preserved)', () => {
        it('lowercases and trims content', () => {
            expect(preprocessMessage('  HELLO World  ')).toBe('hello world');
        });

        it('removes URLs', () => {
            expect(preprocessMessage('check https://example.com out')).toBe('check  out');
        });

        it('removes user mentions', () => {
            expect(preprocessMessage('hey <@123> there <@!456>!')).toBe('hey  there !');
        });

        it('removes custom emoji ids', () => {
            expect(preprocessMessage('react <:smile:123> here')).toBe('react  here');
            expect(preprocessMessage('react <a:wink:456> here')).toBe('react  here');
        });

        it('strips code-block contents (matches CCP behavior)', () => {
            // The CCP-era regex deletes code blocks — keep that for parity.
            const result = preprocessMessage('hi `secret` end');
            expect(result).not.toContain('secret');
        });

        it('unwraps bold/italic markers but keeps the inner text', () => {
            expect(preprocessMessage('this is **bold** text')).toBe('this is bold text');
            expect(preprocessMessage('this is *italic* text')).toBe('this is italic text');
        });

        it('unwraps strikethrough and underline markers', () => {
            expect(preprocessMessage('~~struck~~ and __under__')).toBe('struck and under');
        });
    });

    describe('homoglyph normalization', () => {
        it('folds Cyrillic uppercase to Latin', () => {
            // А (U+0410) is Cyrillic; a is Latin
            expect(preprocessMessage('Аttention')).toBe('attention');
        });

        it('folds Cyrillic lowercase to Latin', () => {
            // 'tаіwаn' contains Cyrillic а / і / а
            expect(preprocessMessage('tаіwаn')).toBe('taiwan');
        });

        it('folds Greek lookalikes to Latin', () => {
            // Α (U+0391) is Greek alpha
            expect(preprocessMessage('Αttention')).toBe('attention');
        });

        it('NFKC-normalizes fullwidth Latin characters', () => {
            // ｎ (U+FF4E) → n via NFKC
            expect(preprocessMessage('ｎormal')).toBe('normal');
        });

        it('NFKC-normalizes mathematical alphanumeric symbols', () => {
            // 𝐧 (U+1D427 Mathematical Bold Small N) → n via NFKC
            expect(preprocessMessage('\u{1D427}ormal')).toBe('normal');
        });

        it('strips zero-width characters', () => {
            // U+200B between letters
            expect(preprocessMessage('te​st')).toBe('test');
            // U+200C, U+200D, U+2060, U+FEFF
            expect(preprocessMessage('te‌st')).toBe('test');
            expect(preprocessMessage('te‍st')).toBe('test');
            expect(preprocessMessage('te⁠st')).toBe('test');
            expect(preprocessMessage('te﻿st')).toBe('test');
        });
    });

    describe('unwrap options (slur-moderation behavior)', () => {
        it('unwraps inline code blocks instead of stripping them', () => {
            const result = preprocessMessage('hi `secret` end', {
                unwrapCodeBlocks: true,
            });
            expect(result).toContain('secret');
        });

        it('unwraps triple-backtick code blocks', () => {
            const result = preprocessMessage('say ```hidden``` now', {
                unwrapCodeBlocks: true,
            });
            expect(result).toContain('hidden');
        });

        it('unwraps spoiler tags', () => {
            const result = preprocessMessage('hidden ||contraband|| here', {
                unwrapSpoilers: true,
            });
            expect(result).toContain('contraband');
            expect(result).not.toContain('||');
        });

        it('combines unwrap with homoglyph + zero-width handling', () => {
            // Cyrillic а + zero-width inside spoiler tags
            const input = '||tа​iwan||';
            const result = preprocessMessage(input, {
                unwrapSpoilers: true,
            });
            expect(result).toContain('taiwan');
        });
    });
});
