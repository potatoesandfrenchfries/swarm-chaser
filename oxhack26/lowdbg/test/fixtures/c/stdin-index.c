#include <stdio.h>

int main(void) {
    int table[4] = {10, 20, 30, 40};
    int idx = 0;
    if (scanf("%d", &idx) != 1) return 1;
    printf("%d\n", table[idx]); // BUG
    return 0;
}
