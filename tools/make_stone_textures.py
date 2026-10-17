"""
Stone textures for the temple, from the ruined-temple flooring reference
(docs/reference/floor-reference.jpg, 800 x 800, already seamless):

    src/assets/textures/temple_floor.jpg  the whole sheet, moss toned down (55 % saturation) so it
                                          sits in the cold, moonlit palette; tiles seamlessly
    src/assets/textures/stone_block.jpg   one wide slab with its mortar edge, for wall blocks

    python3 tools/make_stone_textures.py
"""
from PIL import Image, ImageEnhance

src = Image.open('docs/reference/floor-reference.jpg').convert('RGB')
floor = ImageEnhance.Color(src).enhance(0.55)
floor.save('src/assets/textures/temple_floor.jpg', quality=88)
floor.crop((523, 412, 742, 500)).resize((256, 128), Image.LANCZOS).save('src/assets/textures/stone_block.jpg', quality=90)
print('ok')
