#include <stdio.h>

int main(void) {
    int sum = 0;
    for (int i = 0; i < 6; i++) {
        sum += i * i; // BUG
    }
    printf("%d\n", sum);
    return 0;
}
