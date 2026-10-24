#include <stdio.h>

int main(void) {
    int buf[4] = {0};
    for (int i = 0; i <= 4; i++)
        buf[i] = i; // BUG
    printf("%d\n", buf[0]);
    return 0;
}
