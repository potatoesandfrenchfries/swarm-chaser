#include <pthread.h>
#include <stdio.h>

static int counter;

static void *worker(void *arg) {
    (void)arg;
    for (int i = 0; i < 1000; i++) counter++; // BUG
    return NULL;
}

int main(void) {
    pthread_t t;
    pthread_create(&t, NULL, worker, NULL);
    for (int i = 0; i < 1000; i++) counter++; // BUG
    pthread_join(t, NULL);
    printf("%d\n", counter);
    return 0;
}
